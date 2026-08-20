"""Deterministic structural repair of an LLM-produced graph.

The extraction prompt states the graph's invariants, but nothing enforced them:
compiled graphs in the wild contained edges outside the allowed category table
(``claim -> claim``), the same edge emitted twice, and nodes connected to
nothing. This module re-imposes the invariants in code, after extraction and
before quote validation, so the payload that reaches the UI is always
structurally legal.

Repairs are *subtractive only* — an illegal edge is dropped, never rewritten —
and every removal is logged so prompt regressions stay visible.
"""
from collections import defaultdict
from dataclasses import dataclass, field

from app.enums.node import EdgeRelation, NodeCategory
from app.schemas.graph import GraphPayload

import logging

logger = logging.getLogger(__name__)


# The legal (source category, target category) pairs per relation, mirroring
# section 4 of the extraction prompt. Anything absent here is invalid output.
ALLOWED_PAIRS: dict[EdgeRelation, frozenset[tuple[NodeCategory, NodeCategory]]] = {
    EdgeRelation.SUPPORTS: frozenset(
        {
            (NodeCategory.EVIDENCE, NodeCategory.CLAIM),
            (NodeCategory.METHODOLOGY, NodeCategory.EVIDENCE),
            (NodeCategory.METHODOLOGY, NodeCategory.METHODOLOGY),
        }
    ),
    EdgeRelation.LIMITS: frozenset(
        {
            (NodeCategory.LIMITATION, NodeCategory.CLAIM),
            (NodeCategory.LIMITATION, NodeCategory.METHODOLOGY),
        }
    ),
    EdgeRelation.CAUSES: frozenset(
        {
            (NodeCategory.CLAIM, NodeCategory.CONSEQUENCE),
            (NodeCategory.CLAIM, NodeCategory.RISK),
        }
    ),
    EdgeRelation.CHALLENGES: frozenset(
        {
            (NodeCategory.EVIDENCE, NodeCategory.CLAIM),
            (NodeCategory.CONSEQUENCE, NodeCategory.CLAIM),
        }
    ),
}


@dataclass
class RepairReport:
    """What ``repair_graph`` removed, and what it could only warn about."""

    dangling_edges: list[str] = field(default_factory=list)
    self_loop_edges: list[str] = field(default_factory=list)
    illegal_edges: list[str] = field(default_factory=list)
    duplicate_edges: list[str] = field(default_factory=list)
    orphan_nodes: list[str] = field(default_factory=list)
    # Sizes of the connected components left in the graph. More than one entry
    # means the graph reads as several unrelated pictures.
    component_sizes: list[int] = field(default_factory=list)

    @property
    def removed_edge_count(self) -> int:
        return (
            len(self.dangling_edges)
            + len(self.self_loop_edges)
            + len(self.illegal_edges)
            + len(self.duplicate_edges)
        )

    @property
    def is_fragmented(self) -> bool:
        return len(self.component_sizes) > 1


def _connected_components(node_ids: list[str], edges) -> list[list[str]]:
    """Group ``node_ids`` into undirected connected components."""
    adjacency = defaultdict(set)
    known = set(node_ids)
    for edge in edges:
        if edge.source in known and edge.target in known:
            adjacency[edge.source].add(edge.target)
            adjacency[edge.target].add(edge.source)

    seen: set[str] = set()
    components: list[list[str]] = []
    for node_id in node_ids:
        if node_id in seen:
            continue
        stack = [node_id]
        component: list[str] = []
        while stack:
            current = stack.pop()
            if current in seen:
                continue
            seen.add(current)
            component.append(current)
            stack.extend(adjacency[current] - seen)
        components.append(component)
    return components


def repair_graph(payload: GraphPayload) -> RepairReport:
    """Drop structurally invalid edges and orphaned nodes from ``payload``.

    Applied in order:

    1. edges pointing at a node id that was never emitted,
    2. self-loops,
    3. edges whose (source category, target category) pair is not in
       :data:`ALLOWED_PAIRS` for their relation,
    4. repeated ``(source, target, relation)`` triples (the first wins),
    5. nodes left touching no edge at all.

    Graph *fragmentation* (several disconnected components) is reported and
    logged but never repaired by deletion: the smaller components are usually
    real, quote-backed content — most often the whole methodology chain — and
    silently discarding them costs the reader far more than an extra cluster on
    the canvas.

    Mutates ``payload`` in place and returns the :class:`RepairReport`.
    """
    report = RepairReport()

    category_by_id = {node.id: node.node_category for node in payload.nodes}

    kept_edges = []
    seen_triples: set[tuple[str, str, EdgeRelation]] = set()
    for edge in payload.edges:
        if edge.source not in category_by_id or edge.target not in category_by_id:
            report.dangling_edges.append(edge.id)
            continue

        if edge.source == edge.target:
            report.self_loop_edges.append(edge.id)
            continue

        pair = (category_by_id[edge.source], category_by_id[edge.target])
        if pair not in ALLOWED_PAIRS.get(edge.relation, frozenset()):
            report.illegal_edges.append(edge.id)
            logger.warning(
                "repair_graph illegal edge id=%s relation=%s pair=%s->%s",
                edge.id,
                edge.relation.value,
                pair[0].value,
                pair[1].value,
            )
            continue

        triple = (edge.source, edge.target, edge.relation)
        if triple in seen_triples:
            report.duplicate_edges.append(edge.id)
            continue
        seen_triples.add(triple)

        kept_edges.append(edge)

    connected_ids = {edge.source for edge in kept_edges} | {
        edge.target for edge in kept_edges
    }
    kept_nodes = []
    for node in payload.nodes:
        if node.id in connected_ids:
            kept_nodes.append(node)
            continue
        report.orphan_nodes.append(node.id)
        logger.warning(
            "repair_graph orphan node id=%s category=%s title=%s",
            node.id,
            node.node_category.value,
            node.title,
        )

    payload.nodes = kept_nodes
    payload.edges = kept_edges

    components = _connected_components([node.id for node in kept_nodes], kept_edges)
    report.component_sizes = sorted((len(c) for c in components), reverse=True)

    if report.is_fragmented:
        logger.warning(
            "repair_graph fragmented graph components=%s",
            report.component_sizes,
        )

    if report.removed_edge_count or report.orphan_nodes:
        logger.info(
            "repair_graph removed edges=%d (dangling=%d self_loop=%d illegal=%d duplicate=%d) "
            "orphan_nodes=%d",
            report.removed_edge_count,
            len(report.dangling_edges),
            len(report.self_loop_edges),
            len(report.illegal_edges),
            len(report.duplicate_edges),
            len(report.orphan_nodes),
        )

    return report
