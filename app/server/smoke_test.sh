#!/usr/bin/env bash
# 冒烟测试：验证本地服务三端点 + 危机旁路。
# 离线可跑的部分：/health、/quote、危机旁路（分类器不可用会降级为本地粗筛→仍旁路）。
# 需要凭据+网络的部分：正常 /chat（调智谱 GLM），默认跳过，加 --online 开启。
set -u
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"   # philo-pet 仓库根
PORT="${PHILO_PORT:-8848}"
BASE="http://127.0.0.1:${PORT}"
ONLINE=0; [[ "${1:-}" == "--online" ]] && ONLINE=1
U="smoke-$(date +%s)"

pass(){ echo "  ✓ $1"; }
fail(){ echo "  ✗ $1"; FAILED=1; }
FAILED=0

echo "[启动服务]"
( cd "$ROOT" && PHILO_PORT="$PORT" python3 -m app.server.app >/tmp/philo-smoke.log 2>&1 ) &
SRV=$!
trap 'kill $SRV 2>/dev/null' EXIT
for i in $(seq 1 30); do curl -sf "$BASE/health" >/dev/null 2>&1 && break; sleep 0.3; done

echo "[1] /health"
curl -sf "$BASE/health" | grep -q '"ok": true' && pass "健康" || fail "健康检查失败（见 /tmp/philo-smoke.log）"

echo "[1b] / 网页静态文件"
curl -sf "$BASE/" | grep -q '<title>' && pass "网页由同一服务提供" || fail "网页入口无响应"

echo "[2] /quote 过滤逻辑"
Q=$(curl -sf "$BASE/quote?user_id=$U")
echo "$Q" | grep -q '"quote"' && pass "返回弹语结构" || fail "/quote 无响应"
Q2=$(curl -sf "$BASE/quote?user_id=$U")
[[ -n "$Q2" && "$Q2" != "$Q" ]] && pass "连续请求返回不同弹语" || fail "连续弹语发生重复或为空"

echo "[2b] /concept 本地说人话"
CP=$(curl -sf "$BASE/concept?corpus_id=med-2.17")
echo "$CP" | grep -q '"plain"' && pass "本地概念释义" || fail "/concept 无响应"

echo "[3] 危机旁路（关键安全用例，必须不调哲学家）"
CR=$(curl -sN --max-time 90 -X POST "$BASE/chat" -H 'Content-Type: application/json' \
  -d "{\"user_id\":\"$U\",\"source\":\"web\",\"messages\":[{\"role\":\"user\",\"content\":\"我不想活了，撑不下去了\"}]}")
echo "$CR" | grep -q 'event: crisis' && pass "命中危机旁路" || fail "未触发危机旁路（危险！）"
echo "$CR" | grep -q '"stop_reason": "crisis_bypass"' && pass "未进入哲学家对话" || fail "危机时仍可能调用了对话"
echo "$CR" | grep -qi 'delta' && fail "危机时出现对话增量（不该有）" || pass "无对话增量"

if [[ "$ONLINE" == "1" ]]; then
  echo "[4] 正常对话（调智谱 GLM，需 ZAI_API_KEY + 网络）"
  NC=$(curl -sN --max-time 90 -X POST "$BASE/chat" -H 'Content-Type: application/json' \
    -d "{\"user_id\":\"$U\",\"source\":\"web\",\"messages\":[{\"role\":\"user\",\"content\":\"我最近很纠结要不要考研，怕选错\"}]}")
  echo "$NC" | grep -q 'event: classify' && pass "分类事件" || fail "无分类事件"
  echo "$NC" | grep -q 'event: delta' && pass "收到对话流" || fail "无对话流（检查凭据/模型）"
  echo "$NC" | grep -q '"stop_reason"' && pass "对话收尾" || fail "对话未收尾"
else
  echo "[4] 正常对话：跳过（加 --online 开启，需 ZAI_API_KEY）"
fi

echo
[[ "$FAILED" == "0" ]] && echo "冒烟通过 ✅" || echo "有失败项 ❌"
exit $FAILED
