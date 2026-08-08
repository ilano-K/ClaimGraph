/**
 * Mock data for the ClaimGraph frontend.
 *
 * The shape deliberately mirrors the backend GraphPayload schema
 * (backend/app/schemas/graph.py + node.py):
 *   - metadata:  { title, author, token_count }
 *   - nodes:     { id, node_category, title, summary, quote, confidence_score }
 *   - edges:     { id, source, target, relation, reasoning }
 *
 * Presentation-only fields (layout coordinates, accent tone, inspector copy)
 * are namespaced under `presentation` so the API contract stays truthful.
 */

export const mockMetadata = {
  title: 'RFC-9214: Distributed Consensus Architecture.pdf',
  author: ['R. Haddad', 'L. Okafor', 'M. Castellanos'],
  token_count: 48213,
}

export const mockExecutiveSummary =
  'This paper proposes a distributed consensus core built on Raft with a pre-vote phase, '
  + 'backed by chaos benchmarks that demonstrate 99.999% availability across three AWS '
  + 'regions while admitting a P99 latency penalty during leader failover.'

export const mockNodes = [
  {
    id: 'node_1',
    node_category: 'tradeoff',
    title: 'High P99 Latency During Leader Failover',
    summary: 'Cross-region quorum adds ~45ms roundtrip delay during primary node election.',
    quote:
      'Under forced leader election tests across three AWS regions, P99 tail latency spiked to 48.2ms due to WAN round-trip consensus constraints.',
    confidence_score: 0.85,
    presentation: {
      x: 150,
      y: 200,
      width: 256,
      height: 168,
      tone: 'red',
      badgeLabel: 'LIMITS → Claim 1',
      meta: 'Node Analysis v2.4',
      synthesis:
        'The system guarantees strong consistency and zero-downtime replication, but incurs a significant performance penalty during edge cases. Cross-region quorum requirements mean that leader election failures consistently drive P99 tail latencies above acceptable thresholds for real-time services.',
      quoteSource: 'Source: RFC-9214, Section 4.2.1, Pg. 12',
      thread: [
        {
          author: 'user',
          text: 'Is there any mention of caching to mitigate this latency spike?',
        },
        {
          author: 'assistant',
          text: 'Yes. In Section 5.1, the authors propose a stale-read replica strategy that allows non-critical queries to bypass the leader election delay, effectively masking the latency for read-heavy workloads.',
        },
      ],
      citations: [
        {
          id: 'cit-1',
          text: 'During forced leader election tests across three AWS regions, P99 tail latency spiked.',
          meta: 'RFC-9214, Section 4.2.1, Pg. 12',
        },
        {
          id: 'cit-2',
          text: 'The authors propose a stale-read replica strategy for non-critical queries.',
          meta: 'RFC-9214, Section 5.1, Pg. 18',
        },
      ],
    },
  },
  {
    id: 'node_2',
    node_category: 'claim',
    title: 'Zero-Downtime Multi-Region Replication',
    summary: 'Achieves 99.999% availability across 3 active availability zones.',
    quote:
      'Achieves 99.999% availability across three active availability zones with no dropped transactions during failover.',
    confidence_score: 0.95,
    presentation: {
      x: 600,
      y: 80,
      width: 288,
      height: 168,
      tone: 'blue',
      badgeLabel: 'SUPPORTS → System Architecture',
      meta: 'Node Analysis v2.4',
      synthesis:
        'A core architectural claim: three active availability zones allow the system to absorb a regional outage without halting the consensus log.',
      quoteSource: 'Source: RFC-9214, Section 3.1, Pg. 6',
      thread: [],
      citations: [
        {
          id: 'cit-3',
          text: 'Three availability zones, one standby region, zero-downtime failover under 12s.',
          meta: 'RFC-9214, Section 3.1, Pg. 6',
        },
      ],
    },
  },
  {
    id: 'node_3',
    node_category: 'evidence',
    title: 'Chaos Engineering Benchmark Results',
    summary: 'Sustained 50,000 req/sec under simulated 40% packet loss in AWS us-east-1.',
    quote:
      'Sustained 50,000 req/sec under simulated 40% packet loss across three inter-region links.',
    confidence_score: 0.92,
    presentation: {
      x: 800,
      y: 300,
      width: 256,
      height: 168,
      tone: 'green',
      badgeLabel: 'EVIDENCE → Benchmark',
      meta: 'Node Analysis v2.4',
      synthesis:
        'Empirical measurements serve as the strongest verification of the replication claim, holding throughput even while a regional link loses 40% of its packets.',
      quoteSource: 'Source: RFC-9214, Appendix B, Pg. 14',
      thread: [],
      citations: [
        {
          id: 'cit-4',
          text: '50,000 req/sec sustained with 40% packet loss on inter-region links.',
          meta: 'RFC-9214, Appendix B2, Pg. 14',
        },
      ],
    },
  },
  {
    id: 'node_4',
    node_category: 'methodology',
    title: 'Raft Consensus with Pre-Vote Phase',
    summary: 'Pre-vote phase avoids unwarranted leader elections and stale reads.',
    quote:
      'The pre-vote phase prevents a partitioned candidate from disrupting an active leader.',
    confidence_score: 0.88,
    presentation: {
      x: 550,
      y: 400,
      width: 224,
      height: 168,
      tone: 'purple',
      badgeLabel: 'CONCEPT → Core',
      meta: 'Node Analysis v2.4',
      synthesis:
        'Core algorithmic foundation driving both the availability and latency trade-offs seen in the rest of the graph.',
      quoteSource: 'Source: RFC-9214, Section 5.1, Pg. 18',
      thread: [],
      citations: [
        {
          id: 'cit-5',
          text: 'Pre-vote phase requires a candidate to win a preliminary round before incrementing terms.',
          meta: 'RFC-9214, Section 5.1, Pg. 18',
        },
      ],
    },
  },
]

export const mockEdges = [
  {
    id: 'edge_1',
    source: 'node_1',
    target: 'node_2',
    relation: 'limits',
    reasoning:
      'Leader election latency imposes a maximum on the zero-downtime claim under peak failover conditions.',
    path: 'M 350 250 C 500 250, 400 150, 600 150',
  },
  {
    id: 'edge_2',
    source: 'node_2',
    target: 'node_3',
    relation: 'supports',
    reasoning:
      'Backend chaos benchmark evidence directly validates the availability properties claimed by the system architecture.',
    path: 'M 600 150 C 750 150, 650 350, 800 350',
  },
  {
    id: 'edge_3',
    source: 'node_1',
    target: 'node_4',
    relation: 'depends_on',
    reasoning:
      'The failover latency characteristic depends on the pre-vote corridor and stale-read strategy.',
    path: 'M 350 250 C 450 250, 450 450, 550 450',
  },
]

/** Map of accent tone -> tailwind classes / css classes used by node cards. */
export const NODE_TONES = {
  red: {
    badge: 'bg-red-500/10 border border-red-500 text-red-400',
    progress: 'bg-red-500',
    card: 'node-red',
  },
  blue: {
    badge: 'bg-blue-500/10 border border-blue-500 text-blue-400',
    progress: 'bg-blue-500',
    card: 'node-blue',
  },
  green: {
    badge: 'bg-emerald-500/10 border border-emerald-500 text-emerald-400',
    progress: 'bg-emerald-500',
    card: 'node-green',
  },
  purple: {
    badge: 'bg-purple-500/10 border border-purple-500 text-purple-400',
    progress: 'bg-purple-500',
    card: 'node-purple',
  },
}