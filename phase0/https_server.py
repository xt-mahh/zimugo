#!/usr/bin/env python3
"""Phase0 测试页 HTTPS 服务器（自签证书, 8932 端口）——WebGPU 需要安全上下文
带 Cache-Control: 模型/wasm 文件缓存 7 天，其余 1 小时。"""
import http.server, ssl, os

class Handler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        if self.path.endswith(('.onnx', '.wasm', '.mjs', '.min.js')):
            self.send_header('Cache-Control', 'public, max-age=604800')  # 7d
        else:
            self.send_header('Cache-Control', 'public, max-age=3600')    # 1h
        super().end_headers()

os.chdir('/root/workspace/localsub/phase0')
httpd = http.server.ThreadingHTTPServer(('0.0.0.0', 8932), Handler)
ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
ctx.load_cert_chain('/root/workspace/localsub/phase0/cert.pem', '/root/workspace/localsub/phase0/key.pem')
httpd.socket = ctx.wrap_socket(httpd.socket, server_side=True)
print('HTTPS serving on :8932 (with cache headers)')
httpd.serve_forever()
