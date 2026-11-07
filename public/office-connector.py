"""Run with python3 office-connector.py office-config.json on a trusted office computer."""
import ipaddress
import json
import os
import socket
import threading
import urllib.error
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import re
import subprocess
import sys
import time
import urllib.request

def stations(router):
    found = set()
    host = router["host"]
    if not re.fullmatch(r"[a-zA-Z0-9_.@:-]+", host) or host.startswith("-"):
        raise ValueError("Invalid SSH host")
    if not router["interfaces"]:
        raise ValueError("Configure the office Wi-Fi interfaces")
    for interface in router["interfaces"]:
        if not re.fullmatch(r"[a-zA-Z0-9_.-]+", interface):
            raise ValueError("Invalid interface")
        output = subprocess.check_output(["ssh", "-o", "BatchMode=yes", "-o", "ConnectTimeout=8", host, "iw", "dev", interface, "station", "dump"], text=True, timeout=20)
        found.update(re.findall(r"^Station ((?:[0-9a-fA-F]{2}:){5}[0-9a-fA-F]{2}) ", output, re.M))
    return {mac.lower() for mac in found}

def send(config, payload):
    body = json.dumps(payload).encode()
    request = urllib.request.Request(config["url"], data=body, headers={
        "Content-Type": "application/json",
        "OAI-Sites-Authorization": "Bearer " + config["token"]
    })
    with urllib.request.urlopen(request, timeout=20) as response:
        return json.load(response)


def office_ipv4(config):
    address = config.get("pair_ip")
    if not address:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as probe:
            probe.connect((urllib.parse.urlsplit(config["url"]).hostname, 443))
            address = probe.getsockname()[0]
    ip = ipaddress.IPv4Address(address)
    if not any(ip in ipaddress.ip_network(cidr) for cidr in ("10.0.0.0/8", "192.168.0.0/16", "172.16.0.0/12")):
        raise ValueError("Set pair_ip to this computer's office LAN IPv4 address.")
    return str(ip)


def resolve_device(peer, routers):
    # ARP lookup uses the TCP peer, never a phone-supplied identifier.
    with open("/proc/net/arp", encoding="ascii") as table:
        addresses = {row[3].lower() for line in table.readlines()[1:]
                     if len(row := line.split()) >= 6 and row[0] == peer and int(row[2], 16) & 2}
    if len(addresses) != 1:
        raise ValueError("Connect to the same office LAN as the connector and try again.")
    address = addresses.pop()
    if not any(address in stations(router) for router in routers):
        raise ValueError("Phone is not visible on the configured office Wi-Fi.")
    return address


PAIR_PAGE = """<!doctype html><html lang="en"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Pair with NTC Attendance</title><style>body{font:18px system-ui;max-width:30rem;margin:12vh auto;padding:20px;color:#292442}button{font:inherit;background:#5145bd;color:white;border:none;border-radius:8px;padding:12px 18px}</style>
<h1>Pair this phone</h1><p>NT Consultancy will record arrival and departure when this phone joins or leaves the office Wi-Fi.</p>
<button id="pair">Pair my phone</button><p role="status" id="result"></p>
<script>const code=location.hash.slice(1);history.replaceState(null,'','/pair');
const button=document.querySelector('button'),result=document.querySelector('#result');
button.onclick=async()=>{button.disabled=true;try{const r=await fetch('/pair',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code})});result.textContent=await r.text();button.disabled=r.ok;}catch{result.textContent='Connection failed. Join office Wi-Fi and try again.';button.disabled=false;}}</script></html>"""


def pairing_listener(config):
    ip = office_ipv4(config)
    host = ip + ":8788"

    class Handler(BaseHTTPRequestHandler):
        def reply(self, status, text, content_type="text/plain"):
            self.send_response(status)
            self.send_header("Content-Type", content_type + "; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Frame-Options", "DENY")
            self.end_headers()
            self.wfile.write(text.encode())

        def do_GET(self):
            if self.path != "/pair" or self.headers.get("Host") != host:
                return self.reply(404, "Page unavailable.")
            self.reply(200, PAIR_PAGE, "text/html")

        def do_POST(self):
            if self.path != "/pair" or self.headers.get("Host") != host or self.headers.get("Origin") != "http://" + host:
                return self.reply(403, "Open the QR link on your office Wi-Fi.")
            try:
                length = int(self.headers.get("Content-Length", 0))
                if not 0 < length < 256:
                    raise ValueError("Invalid pairing request.")
                code = json.loads(self.rfile.read(length)).get("code", "")
                if not isinstance(code, str) or not re.fullmatch(r"[0-9a-f-]{36}", code):
                    raise ValueError("Scan a new QR code from the staff directory.")
                device = resolve_device(self.client_address[0], config["routers"])
                if not send(config, {"action": "redeem", "code": code, "device": device}).get("ok"):
                    raise ValueError("Pairing was not accepted.")
            except urllib.error.HTTPError as exc:
                return self.reply(409 if exc.code == 409 else 503, "Code expired, already used, or device already registered." if exc.code == 409 else "Office connector could not reach attendance.")
            except ValueError as exc:
                return self.reply(400, str(exc))
            except (OSError, subprocess.SubprocessError):
                return self.reply(503, "Unable to verify the phone on the office network.")
            self.reply(200, "Phone paired. Attendance starts with the next Wi-Fi check.")

    if not os.path.isfile("/proc/net/arp"):
        raise ValueError("QR pairing requires a Linux connector on the staff LAN.")
    server = ThreadingHTTPServer((ip, 8788), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return ip


def run(config):
    if not config["routers"]:
        raise ValueError("Add at least one access point")
    pair_ip = None
    try:
        pair_ip = pairing_listener(config)
        print("Phone pairing ready on", pair_ip, flush=True)
    except (OSError, ValueError) as error:
        print("QR pairing unavailable:", error, file=sys.stderr, flush=True)
    while True:
        try:
            devices = set().union(*(stations(router) for router in config["routers"]))
            if not send(config, {"action":"snapshot","devices":sorted(devices),"pairIp":pair_ip}).get("ok"):
                raise ValueError("Snapshot was not accepted")
            print("Office network synced", flush=True)
        except Exception as error:
            print("Sync paused:", error, file=sys.stderr, flush=True)
        time.sleep(30)

if __name__ == "__main__":
    with open(sys.argv[1], encoding="utf-8") as stream:
        run(json.load(stream))
