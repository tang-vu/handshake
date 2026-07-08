# Handshake — Handoff (2026-07-08)

Trạng thái: **HOÀN THÀNH kỹ thuật.** Agent live, real mode, đã có 1 audit **PASS thật** với settlement USDC trên Base, verify được. Còn lại: quay video + nộp DoraHacks (deadline **2026-07-12 09:00 UTC = 16:00 VN**).

## TL;DR còn phải làm (chỉ user)
1. Revoke Cloudflare API token `cfat_MAz...` (đã dùng xong).
2. Quay video ≤5 phút theo `docs/DEMO-SCRIPT.md` (dùng report PASS + tx BaseScan bên dưới).
3. Điền Agent Store listing URL (link agent Handshake) vào `docs/DORAHACKS-SUBMISSION.md`, dán text mô tả sẵn, submit.

## Dự án
- CROO Agent Hackathon. Handshake = **CAP Integration Auditor**: agent trả phí, được thuê qua CAP để audit tích hợp CAP của agent khác (probe N lần, verify settlement on-chain, trả **signed attestation** + hash-chained trace + badge).
- Repo: https://github.com/tang-vu/handshake (public, MIT). Branch `main`.
- Stack: TypeScript, Hono, better-sqlite3, @noble/ed25519, ethers v6, @croo-network/sdk. Docker.
- Ground truth CAP: `docs/CAP-NOTES.md` (+ `docs-cap/` mirror). Plan: `plans/260707-0839-handshake-cap-integration-auditor/plan.md`.

## Hạ tầng (đang chạy)
- **Server**: Ubuntu 24.04, SSH `hanhgia2212@192.168.1.19` (LAN; password auth — xem memory local). Docker sẵn.
- Deploy dir `~/handshake`; container `handshake-handshake-1`; port 8787. Deploy: `bash ~/handshake/scripts/deploy.sh` (git pull + docker compose up --build). Data volume root-owned → xoá cần `sudo rm -rf ~/handshake/data`.
- **Public URL**: https://handshake.tangvu.dev (Cloudflare named tunnel `handshake`, id `c26889a0-2174-4a3a-a60f-199cd4450cc8`, zone `tangvu.dev`, systemd `handshake-tunnel.service`, token ở `/etc/handshake-tunnel.env`). KHÔNG đụng tunnel cũ conzit.com/xacecalls.com trên cùng máy.
- Routes: `/healthz` `/report/:id` `/verify/:id` `/trace/:id` (HTML nếu Accept: text/html) `/badge/:agentId.svg|.json` `/favicon.svg` `/logo.svg`. Dryrun-only: `POST /dev/simulate-intake`.
- Server `.env`: `MODE=real`, `CROO_SDK_KEY` (Handshake), `PUBLIC_BASE_URL=https://handshake.tangvu.dev`, `ED25519_PRIVATE_KEY_HEX` (khoá ký, pubkey `ed25519:a988ca65ba0ec5ea12699d916f80c7cb93776b70827cd6f35da17ee439b7c291`). Agent/Service id để trống → **self-config từ SDK key**.

## CROO — agents & IDs (non-secret)
- **Handshake** (agent bán audit): AA wallet `0x6832d4B13c93530Ad0182a383e21D04B8DbdF65e`. Audit service id (basic 1 USDC): `5a316379-cd0a-4ab7-b25e-0663a202960e`. Deliverable **Text**, SLA 2h.
- **EchoBot** (agent demo: buyer + echo target): agent id `0b27739f-80b1-4fdd-b4b1-ce408ac503b1`, AA wallet `0xb841dD89916C1bcABcfEda9dEFa85c45F9B37Eca`. Echo service id (0.10 USDC): `93fd4cab-2297-4828-ab68-7b738a41da81`.
- USDC (Base): `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`. Số dư đổi liên tục; phí gom về ví Handshake. **Paymaster ăn USDC** → ví phải có USDC trước khi làm gì (không cần ETH).
- SDK keys (secret) ở memory local + server .env. SSH password, Cloudflare token: memory local.

## Bằng chứng PASS (artifacts cho video)
- Report PASS: https://handshake.tangvu.dev/report/f4cb65bd-38af-454d-a57d-d046f880f607
- Verify: https://handshake.tangvu.dev/verify/f4cb65bd-38af-454d-a57d-d046f880f607 (sig VALID, trace chain VALID)
- Trace viewer: https://handshake.tangvu.dev/trace/f4cb65bd-38af-454d-a57d-d046f880f607
- Badge: https://handshake.tangvu.dev/badge/0b27739f-80b1-4fdd-b4b1-ce408ac503b1.svg
- 5 check xanh; settlement_tx_count=10 (5 escrow-lock + 5 release verify on-chain); latency p95 ~91s (<180s).
- Hire tx thật (USDC settle): `0x61ce850429c50612c371d6417b131f8ad14a716be55e54044fab708a7fad768e` → basescan.org/tx/...

## Chạy lại demo audit (nếu cần thêm report)
Cần EchoBot ≥1 USDC ở ví AA (nạp qua Base). Rồi từ máy local:
```
CROO_API_URL=https://api.croo.network CROO_WS_URL=wss://api.croo.network/ws \
CROO_SDK_KEY=<EchoBot SDK key> \
HANDSHAKE_SERVICE_ID=5a316379-cd0a-4ab7-b25e-0663a202960e \
ECHO_SERVICE_ID=93fd4cab-2297-4828-ab68-7b738a41da81 \
npx tsx scripts/demo-echobot.ts
```
Mất ~7-9 phút (5 probe, mỗi probe ~90s do createOrder + delivery on-chain của CROO). Script poll-driven, tự thoát khi nhận report.

## Gotchas (đã fix nhưng nhớ)
- **1 SDK key = 1 WebSocket** (code 1008). Kill tiến trình cũ trước khi chạy lại: TaskStop kill parent nhưng node con mồ côi vẫn giữ WS → PowerShell `Get-CimInstance Win32_Process ... node.exe | where CommandLine like demo-echobot | Stop-Process`. Server có **WS watchdog tự reconnect** sau 1008.
- Restart Handshake dễ bị 1008 (WS cũ chưa nhả) → watchdog tự chữa trong ~20s; hoặc `docker compose down` + chờ ~40s + up.
- Probe latency ~90s là CROO on-chain overhead, không phải target chậm.
- Verify offline bất kỳ report: `npx tsx scripts/verify-report-offline.ts <report-url>`.

## Unresolved / cần user
- Agent Store listing URL của Handshake (chưa có — điền vào submission doc).
- Rotate SSH/RDP password (đã dặn; nếu rotate, cập nhật memory local).
- Revoke Cloudflare API token.
