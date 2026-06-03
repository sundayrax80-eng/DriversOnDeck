function json(statusCode, body, headers = {}) {
    return {
          statusCode,
          headers: {
                  "Content-Type": "application/json",
                  "Access-Control-Allow-Origin": process.env.PUBLIC_SITE_URL || "*",
                  "Access-Control-Allow-Headers": "Content-Type, Authorization",
                  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
                  ...headers
          },
          body: JSON.stringify(body)
    };
}

function parseBody(event) {
    if (!event.body) return {};
    try {
          return JSON.parse(event.body);
    } catch (error) {
          const err = new Error("Invalid JSON request body");
          err.statusCode = 400;
          err.cause = error;
          throw err;
    }
}

function handleOptions(event) {
    if (event.httpMethod === "OPTIONS") return json(204, {});
    return null;
}

module.exports = { json, parseBody, handleOptions };
