const API_BASE = 'http://localhost:5000/api';

async function testTimer() {
  const loginRes = await fetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@footballportal.com', password: 'AdminPassword123!' })
  });
  const loginJson = await loginRes.json();
  console.log('Login success:', loginJson.success, 'Token present:', Boolean(loginJson.data?.token));
  const token = loginJson.data?.token;

  const matchesRes = await fetch(`${API_BASE}/matches`);
  const matchesJson = await matchesRes.json();
  const match2 = matchesJson.data.find(m => m.matchNumber === 2);
  console.log('Found match #2:', match2._id, 'status:', match2.status, 'timer:', match2.timer);

  const startRes = await fetch(`${API_BASE}/matches/${match2._id}/timer/start`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    }
  });
  const startJson = await startRes.json();
  console.log('Start timer response:', JSON.stringify(startJson, null, 2));

  for (let i = 1; i <= 6; i++) {
    await new Promise(r => setTimeout(r, 2500));
    const checkRes = await fetch(`${API_BASE}/matches/${match2._id}`);
    const checkJson = await checkRes.json();
    const t = checkJson.data.timer;
    console.log(`Poll #${i} (${i * 2.5}s): isRunning=${t.isRunning}, isPaused=${t.isPaused}, remaining=${t.remainingTime}, phaseEndsAt=${t.phaseEndsAt}, status=${checkJson.data.status}`);
  }
}

testTimer().catch(console.error);
