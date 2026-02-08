# System Design - AgentForge

**Production-Grade AI Agent Orchestration Platform**

## Architecture Overview

```
Users → CDN → Load Balancer → [Frontend | Backend API] → [PostgreSQL | Redis | n8n]
                                     ↓
                               Workers → LLM Providers
```

## Tech Stack

**Frontend:** Next.js 14, TypeScript, React Flow, React Query, Zustand  
**Backend:** NestJS, Prisma, BullMQ, Socket.IO  
**Data:** PostgreSQL (RDS), Redis (ElastiCache)  
**Orchestration:** n8n (self-hosted)  
**Auth:** JWT + OAuth2 (Google, GitHub)  
**Deployment:** AWS ECS Fargate, Terraform  
**Observability:** Grafana Loki, Prometheus, Jaeger

## Security

- Multi-tenant row-level security
- Prompt injection defense (tool output sanitization)
- PII redaction in logs
- Webhook signature validation
- Rate limiting (API: 1000/min, Executions: 100/min)
- Secrets in AWS KMS

## Scalability

- Horizontal: Auto-scale ECS tasks based on CPU/requests
- Database: Read replicas, connection pooling
- Redis: Cluster mode
- Queue: BullMQ with priority queues
- CDN: CloudFlare for static assets

## Observability

**Logs:** Structured JSON with correlation IDs  
**Metrics:** Business (executions, cost) + Infrastructure (latency, queue depth)  
**Tracing:** OpenTelemetry end-to-end  
**Alerts:** Error rate >5%, p95 latency >3s, cost >$100/hr

See detailed diagrams in `/docs/architecture/`
