const express = require('express');
const path = require('path');
const fs = require('fs');

const router = express.Router();

const openApiPath = path.join(__dirname, 'openapi.json');

// Serve raw OpenAPI JSON
router.get('/openapi.json', (req, res) => {
  res.sendFile(openApiPath);
});

// Serve interactive Swagger UI HTML page
router.get('/', (req, res) => {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Football Tournament Portal API - Swagger UI</title>
  <link rel="stylesheet" type="text/css" href="https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/4.18.3/swagger-ui.css" />
  <link rel="icon" type="image/png" href="https://cdn-icons-png.flaticon.com/512/53/53283.png" sizes="32x32" />
  <style>
    html { box-sizing: border-box; overflow: -moz-scrollbars-vertical; overflow-y: scroll; }
    *, *:before, *:after { box-sizing: inherit; }
    body { margin: 0; background: #fafafa; font-family: sans-serif; }
    .swagger-ui .topbar { background-color: #064e3b; border-bottom: 2px solid #10b981; }
    .swagger-ui .topbar a { max-width: 300px; font-weight: bold; color: #ecfdf5; }
    .custom-header { background: #064e3b; color: white; padding: 16px 24px; font-size: 18px; font-weight: 700; display: flex; align-items: center; justify-content: space-between; }
    .custom-header span { color: #a7f3d0; font-size: 13px; font-weight: 500; }
  </style>
</head>
<body>
  <div class="custom-header">
    <div>⚽ FOOTBALL TOURNAMENT MANAGEMENT PORTAL • API SPECIFICATION</div>
    <span>Express 4.21 • Socket.IO 4.8 • OpenAPI 3.0</span>
  </div>
  <div id="swagger-ui"></div>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/4.18.3/swagger-ui-bundle.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/4.18.3/swagger-ui-standalone-preset.js"></script>
  <script>
    window.onload = function() {
      window.ui = SwaggerUIBundle({
        url: "/api/docs/openapi.json",
        dom_id: '#swagger-ui',
        deepLinking: true,
        presets: [
          SwaggerUIBundle.presets.apis,
          SwaggerUIStandalonePreset
        ],
        layout: "BaseLayout"
      });
    };
  </script>
</body>
</html>`;
  res.setHeader('Content-Type', 'text/html');
  res.send(html);
});

module.exports = router;
