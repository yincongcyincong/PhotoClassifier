#!/usr/bin/env node
import {Server} from "@modelcontextprotocol/sdk/server/index.js";
import {StdioServerTransport} from "@modelcontextprotocol/sdk/server/stdio.js";
import {CallToolRequestSchema, ListToolsRequestSchema,} from "@modelcontextprotocol/sdk/types.js";
import fetch from "node-fetch";

const VM_URL = process.env.VM_URL;
const VM_SELECT_URL = process.env.VM_SELECT_URL
const VM_INSERT_URL = process.env.VM_INSERT_URL

const VM_DATA_WRITE_TOOL = {
  name: "vm_data_write",
  description: "Write data to the VM database",
  inputSchema: {
    type: "object",
    properties: {
      metric: {
        type: "object",
        description: "tag of metric",
      },
      values: {
        type: "array",
        description: "Array of metric values",
        items: {
          "type": "number"
        },
      },
      timestamps: {
        type: "array",
        description: "Array of metric timestamps",
        items: {
          "type": "number"
        },
      }
    },
    required: ["metric", "values", "timestamps"],
  }
};

const VM_PROMETHEUS_WRITE_TOOL = {
  name: "vm_prometheus_write",
  description: "mport Prometheus exposition format data into VictoriaMetrics",
  inputSchema: {
    type: "object",
    properties: {
      data: {
        type: "string",
        description: "Metrics data in Prometheus exposition format",
      },
    },
    required: ["data"],
  }
};

const VM_QUERY_RANGE_TOOL = {
  name: "vm_query_range",
  description: "Query time series over a time range",
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "PromQL expression",
      },
      start: {
        type: "number",
        description: "Start timestamp in Unix seconds",
      },
      end: {
        type: "number",
        description: "End timestamp in Unix seconds",
      },
      step: {
        type: "string",
        description: "Query resolution step width",
      }
    },
    required: ["query"],
  }
};

const VM_QUERY_TOOL = {
  name: "vm_query",
  description: "Query current value of a time series",
  inputSchema: {
    type: "object",
    properties: {
      query: {
        type: "string",
        description: "PromQL expression to evaluate",
      },
      time: {
        type: "number",
        description: "Evaluation timestamp in Unix seconds (optional)",
      }
    },
    required: ["query"],
  }
};

const VM_LABELS_TOOL = {
  name: "vm_labels",
  description: "Get all unique label names",
  inputSchema: {
    type: "object",
    properties: {},
    required: [],
  }
};

const VM_LABEL_VALUES_TOOL = {
  name: "vm_label_values",
  description: "Get all unique values for a specific label",
  inputSchema: {
    type: "object",
    properties: {
      label: {
        type: "string",
        description: "Label name to retrieve values for",
      }
    },
    required: ["label"],
  }
};


const VM_TOOLS = [
  VM_DATA_WRITE_TOOL,
  VM_QUERY_RANGE_TOOL,
  VM_QUERY_TOOL,
  VM_LABELS_TOOL,
  VM_LABEL_VALUES_TOOL,
  VM_PROMETHEUS_WRITE_TOOL
];

async function vmDataQuery(query, step) {
  let urlStr = VM_URL
  if (urlStr === "") {
    urlStr = VM_SELECT_URL
  }
  const url = new URL(urlStr + "/api/v1/query");
  url.searchParams.append("query", query);
  const response = await fetch(url.toString());
  const data = await response.json();

  if (data.status === "success") {
    return {
      content: [{
        type: "text",
        text: JSON.stringify(data.data),
      }],
      isError: false
    };
  } else {
    return {
      content: [{
        type: "text",
        text: "range query fail:" + await response.text(),
      }],
      isError: true
    };
  }
}

async function vmDataRangeQuery(query, start, end, step) {
  let urlStr = VM_URL
  if (urlStr === "") {
    urlStr = VM_SELECT_URL
  }
  const url = new URL(urlStr + "/api/v1/query_range");
  url.searchParams.append("query", query);
  url.searchParams.append("start", start ?? "");
  url.searchParams.append("end", end ?? "");
  url.searchParams.append("step", step ?? "");
  const response = await fetch(url.toString());
  const data = await response.json();

  if (data.status === "success") {
    return {
      content: [{
        type: "text",
        text: JSON.stringify(data.data),
      }],
      isError: false
    };
  } else {
    return {
      content: [{
        type: "text",
        text: "range query fail:" + await response.text(),
      }],
      isError: true
    };
  }
}

async function vmMetricsDataWrite(metric, values, timestamps) {
  let urlStr = VM_URL
  if (urlStr === "") {
    urlStr = VM_INSERT_URL
  }
  const url = new URL(urlStr + "/api/v1/import");
  const data = {
    "metric": metric,
    "values": values,
    "timestamps": timestamps
  };

  const response = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(data)
  });
  const status = response.status;

  if (status === 204) {
    return {
      content: [{
        type: "text",
        text: response.text(),
      }],
      isError: false
    };
  } else {
    return {
      content: [{
        type: "text",
        text: response.text(),
      }],
      isError: true
    };
  }
}

async function vmPrometheusWrite(data) {
  let urlStr = VM_URL
  if (urlStr === "") {
    urlStr = VM_INSERT_URL
  }
  const url = new URL(urlStr + "/api/v1/import/prometheus");

  const response = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      'Content-Type': 'text/plain'
    },
    body: data
  });
  const status = response.status;

  if (status === 204) {
    return {
      content: [{
        type: "text",
        text: response.text(),
      }],
      isError: false
    };
  } else {
    return {
      content: [{
        type: "text",
        text: response.text(),
      }],
      isError: true
    };
  }
}

async function vmLabels() {
  let urlStr = VM_URL
  if (urlStr === "") {
    urlStr = VM_SELECT_URL
  }
  const url = new URL(urlStr + "/api/v1/labels");
  const response = await fetch(url.toString());
  const data = await response.json();

  if (data.status === "success") {
    return {
      content: [{
        type: "text",
        text: JSON.stringify(data.data),
      }],
      isError: false
    };
  } else {
    return {
      content: [{
        type: "text",
        text: "range query fail:" + await response.text(),
      }],
      isError: true
    };
  }
}

async function vmLabelValues(label) {
  let urlStr = VM_URL
  if (urlStr === "") {
    urlStr = VM_SELECT_URL
  }
  const url = new URL(urlStr + "/api/v1/label/"+ label +"/values");
  const response = await fetch(url.toString());
  const data = await response.json();

  if (data.status === "success") {
    return {
      content: [{
        type: "text",
        text: JSON.stringify(data.data),
      }],
      isError: false
    };
  } else {
    return {
      content: [{
        type: "text",
        text: "range query fail:" + await response.text(),
      }],
      isError: true
    };
  }
}

// Server setup
const server = new Server({
  name: "mcp-server/victoria-metrics",
  version: "0.1.0",
}, {
  capabilities: {
    tools: {},
  },
});
// Set up request handlers
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: VM_TOOLS,
}));
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  try {
    switch (request.params.name) {
      case "vm_data_write": {
        const {metric, values, timestamps} = request.params.arguments;
        return await vmMetricsDataWrite(metric, values, timestamps);
      }
      case "vm_query_range": {
        const {query, start, end, step} = request.params.arguments;
        return await vmDataRangeQuery(query, start, end, step);
      }
      case "vm_query": {
        const {query, start, end, step} = request.params.arguments;
        return await vmDataQuery(query, start, end, step);
      }
      case "vm_labels": {
        return await vmLabels();
      }
      case "vm_label_values": {
        const {label} = request.params.arguments;
        return await vmLabelValues(label);
      }
      case "vm_prometheus_write": {
        const {data} = request.params.arguments;
        return await vmPrometheusWrite(data);
      }
      default:
        return {
          content: [{
            type: "text",
            text: `Unknown tool: ${request.params.name}`
          }],
          isError: true
        };
    }
  } catch (error) {
    return {
      content: [{
        type: "text",
        text: `Error: ${error instanceof Error ? error.message : String(error)}`
      }],
      isError: true
    };
  }
});

async function runServer() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("VictoriaMetrics MCP Server running on stdio");
}

runServer().catch((error) => {
  console.error("Fatal error running server:", error);
  process.exit(1);
});
