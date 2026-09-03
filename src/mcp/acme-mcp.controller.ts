import { All, Controller, Req, Res, UseGuards } from '@nestjs/common';
import { Request, Response } from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { AdminTokenGuard } from '../admin/admin-token.guard';
import { createLogger } from '../common/logger';
import { OpsToolsService } from './ops-tools.service';

const log = createLogger('ops-mcp');

/**
 * Acme's own MCP server: the operator runbook as tools, behind the admin token.
 * Whawit connects to it as the customer-provided action source; every
 * mutating tool is gated by a human approval on Whawit's side before it is
 * called. Stateless streamable-HTTP: one MCP server instance per request.
 */
@Controller('mcp')
@UseGuards(AdminTokenGuard)
export class AcmeMcpController {
  constructor(private readonly ops: OpsToolsService) {}

  @All()
  async handle(@Req() req: Request, @Res() res: Response): Promise<void> {
    if (req.method !== 'POST') {
      res.status(405).json({ jsonrpc: '2.0', error: { code: -32000, message: 'Stateless server: use POST' }, id: null });
      return;
    }
    const server = this.buildServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on('close', () => {
      transport.close().catch(() => undefined);
      server.close().catch(() => undefined);
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, req.body);
    } catch (err) {
      log.error({ event: 'mcp_request_failed', err }, `MCP request failed: ${(err as Error).message}`);
      if (!res.headersSent) {
        res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: 'Internal error' }, id: null });
      }
    }
  }

  private buildServer(): McpServer {
    const server = new McpServer({ name: 'acme-ops', version: '1.0.0' });
    const text = (value: unknown) => ({ content: [{ type: 'text' as const, text: JSON.stringify(value, null, 2) }] });

    server.registerTool(
      'get_service_status',
      {
        title: 'Service status',
        description:
          'Read-only: current release, Cloud Run revision, orders by state, database pool usage and any active fault injection in acme-orders.',
        inputSchema: {},
      },
      async () => text(this.ops.status()),
    );

    server.registerTool(
      'rollback_release',
      {
        title: 'Roll back release',
        description:
          'Rolls acme-orders back to the last stable release when a newer release is serving traffic (the deployment runbook: roll back first, investigate second). No-op when the stable release is already serving. Say why in `reason`.',
        inputSchema: { reason: z.string().describe('Why the rollback is needed, e.g. the incident and evidence').optional() },
      },
      async ({ reason }) => {
        const result = this.ops.rollbackRelease(reason);
        log.info({ event: 'mcp_tool_called', tool: 'rollback_release', result }, `MCP tool rollback_release: ${result.message}`);
        return text(result);
      },
    );

    server.registerTool(
      'recycle_db_pool',
      {
        title: 'Recycle database pool',
        description:
          'Emergency action from the connection-pool runbook: drops every checked-out database connection and rebuilds the pool. Queued requests fail once. Use only when ERR_POOL_TIMEOUT is ongoing. Say why in `reason`.',
        inputSchema: { reason: z.string().describe('Why the recycle is needed').optional() },
      },
      async ({ reason }) => {
        const result = this.ops.recycleDbPool(reason);
        log.info({ event: 'mcp_tool_called', tool: 'recycle_db_pool', result }, `MCP tool recycle_db_pool: ${result.message}`);
        return text(result);
      },
    );

    return server;
  }
}
