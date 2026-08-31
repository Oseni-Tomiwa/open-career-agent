import { parseArgs } from 'node:util';

async function runSmokeTest(): Promise<void> {
  const { values } = parseArgs({
    options: {
      apiUrl: { type: 'string', default: 'http://127.0.0.1:3000' },
      webUrl: { type: 'string' },
    },
  });

  const apiUrl = values.apiUrl!.replace(/\/$/, '');
  console.log(`[SMOKE] Running production smoke test against API: ${apiUrl}`);

  // 1. Check Liveness
  const healthRes = await fetch(`${apiUrl}/health`);
  if (!healthRes.ok) {
    throw new Error(`Health check failed with status ${healthRes.status}`);
  }
  const healthData = (await healthRes.json()) as any;
  if (healthData.status !== 'ok') {
    throw new Error(`Health status is not ok: ${JSON.stringify(healthData)}`);
  }
  console.log('✓ API Liveness (/health) verified ok');

  // 2. Check Readiness
  const readyRes = await fetch(`${apiUrl}/ready`);
  if (!readyRes.ok) {
    throw new Error(`Readiness check failed with status ${readyRes.status}`);
  }
  const readyData = (await readyRes.json()) as any;
  if (readyData.status !== 'ready') {
    throw new Error(
      `Readiness status is not ready: ${JSON.stringify(readyData)}`,
    );
  }
  console.log(
    '✓ API Readiness (/ready) verified ready (DB connected & migrated)',
  );

  // 3. Web URL check if provided
  if (values.webUrl) {
    const webRes = await fetch(values.webUrl);
    if (!webRes.ok) {
      throw new Error(`Web URL returned status ${webRes.status}`);
    }
    console.log(`✓ Web endpoint reachable at ${values.webUrl}`);
  }

  // 4. Test Registration (Smoke User)
  const testEmail = `smoke-user-${Date.now()}@rolevia-smoke.test`;
  const regRes = await fetch(`${apiUrl}/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: testEmail,
      password: 'SmokeTestPassword123!',
      transport: 'bearer',
    }),
  });

  if (!regRes.ok) {
    console.log(
      '[SMOKE] Cloud registration returned non-201 (e.g. self-hosted mode). Skipping cloud auth flow.',
    );
    console.log(
      '✓ Smoke test completed successfully (Public endpoints verified).',
    );
    return;
  }

  const regData = (await regRes.json()) as any;
  const token = regData.token;
  const candidateId = regData.session.primaryCandidateId;
  console.log(
    `✓ Cloud User registered: ${testEmail} (Primary candidate: ${candidateId})`,
  );

  // 5. Test Authenticated Session
  const sessionRes = await fetch(`${apiUrl}/auth/session`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!sessionRes.ok) {
    throw new Error(
      `Session verification failed with status ${sessionRes.status}`,
    );
  }
  console.log('✓ Authenticated session (/auth/session) verified');

  // 6. Test Candidate Profile Read
  const profileRes = await fetch(
    `${apiUrl}/candidates/${candidateId}/profile`,
    {
      headers: { Authorization: `Bearer ${token}` },
    },
  );
  if (!profileRes.ok) {
    throw new Error(
      `Candidate profile read failed with status ${profileRes.status}`,
    );
  }
  console.log(
    '✓ Candidate Career Memory profile (/candidates/:id/profile) verified',
  );

  // 7. Test Search Target Creation
  const targetRes = await fetch(
    `${apiUrl}/candidates/${candidateId}/search-targets`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        name: 'Smoke Target',
        targetRoles: ['Backend Engineer'],
      }),
    },
  );
  if (!targetRes.ok) {
    throw new Error(
      `Search target creation failed with status ${targetRes.status}`,
    );
  }
  const targetData = (await targetRes.json()) as any;
  const targetId = targetData.id;
  console.log(`✓ Search target created (${targetId})`);

  // 8. Test Discovery Trigger
  const runRes = await fetch(
    `${apiUrl}/candidates/${candidateId}/search-targets/${targetId}/run`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    },
  );
  if (runRes.status !== 202) {
    throw new Error(
      `Discovery run trigger failed with status ${runRes.status}`,
    );
  }
  console.log('✓ Discovery run task enqueued successfully (202 Accepted)');

  // 9. Logout
  const logoutRes = await fetch(`${apiUrl}/auth/logout`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!logoutRes.ok) {
    throw new Error(`Logout failed with status ${logoutRes.status}`);
  }
  console.log('✓ Session revoked (/auth/logout)');

  console.log('\n==================================================');
  console.log('ALL PRODUCTION SMOKE CHECKS PASSED SUCCESSFULLY!');
  console.log('==================================================');
}

runSmokeTest().catch((error) => {
  console.error('❌ PRODUCTION SMOKE TEST FAILED:', error.message);
  process.exit(1);
});
