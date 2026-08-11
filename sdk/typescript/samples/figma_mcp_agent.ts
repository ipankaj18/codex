#!/usr/bin/env -S NODE_NO_WARNINGS=1 pnpm ts-node-esm --files

import { MultiServerMCPClient } from "@langchain/mcp-adapters";
import { ChatOpenAI } from "@langchain/openai";
import { createAgent } from "langchain";

const requiredEnv = (name: string): string => {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} must be set`);
  }
  return value;
};

const userPrompt = process.argv.slice(2).join(" ").trim();
if (!userPrompt) {
  throw new Error(
    'Pass a prompt, for example: pnpm sample:figma-mcp-agent -- "Describe the selected Figma frame"',
  );
}

const figmaMcpUrl = requiredEnv("FIGMA_MCP_URL");
const figmaMcpToken = process.env.FIGMA_MCP_TOKEN?.trim();

const client = new MultiServerMCPClient({
  throwOnLoadError: true,
  prefixToolNameWithServerName: true,
  useStandardContentBlocks: true,
  mcpServers: {
    figma: {
      transport: "http",
      url: figmaMcpUrl,
      ...(figmaMcpToken ? { headers: { Authorization: `Bearer ${figmaMcpToken}` } } : {}),
    },
  },
});

try {
  const tools = await client.getTools();
  if (tools.length === 0) {
    throw new Error(`The Figma MCP server at ${figmaMcpUrl} returned no tools`);
  }

  const model = new ChatOpenAI({
    model: process.env.OPENAI_MODEL?.trim() || "gpt-5.1",
    temperature: 0,
  });
  const agent = createAgent({
    model,
    tools,
    systemPrompt:
      "You are a Figma assistant. Use the available Figma MCP tools when they are relevant. Do not claim to have inspected or changed a design unless a tool result confirms it.",
  });

  const result = await agent.invoke({
    messages: [{ role: "user", content: userPrompt }],
  });
  const lastMessage = result.messages.at(-1);
  if (!lastMessage) {
    throw new Error("The agent returned no messages");
  }
  console.log(
    typeof lastMessage.content === "string"
      ? lastMessage.content
      : JSON.stringify(lastMessage.content, null, 2),
  );
} finally {
  await client.close();
}
