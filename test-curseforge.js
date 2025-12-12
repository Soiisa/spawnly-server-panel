// test-curseforge.js

// REPLACE THIS with your actual API Key from the CurseForge Console
const API_KEY = '$2a$10$O8htVi5bIPkuJXVEj8apEOo8pHcW90Af.gJZ1lo5Gu0u0wvtDflGm'; 

async function testCurseForge() {
  // Minecraft Game ID is 432
  // We will search for "jei" (Just Enough Items) as a test
  const url = 'https://api.curseforge.com/v1/mods/search?gameId=432&searchFilter=jei&pageSize=3';

  console.log(`Testing CurseForge API...`);
  console.log(`URL: ${url}`);

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
        'x-api-key': API_KEY
      }
    });

    if (!response.ok) {
      console.error(`\n❌ Error: ${response.status} ${response.statusText}`);
      if (response.status === 403) {
        console.error("This usually means the API Key is invalid or you haven't selected a plan/project correctly.");
      }
      return;
    }

    const data = await response.json();
    
    console.log(`\n✅ Success! Found ${data.data.length} results.`);
    console.log('--- First Result ---');
    if (data.data.length > 0) {
      const mod = data.data[0];
      console.log(`Name: ${mod.name}`);
      console.log(`ID: ${mod.id}`);
      console.log(`Summary: ${mod.summary}`);
      console.log(`Download Count: ${mod.downloadCount}`);
    }

  } catch (error) {
    console.error('\n❌ Network or Script Error:', error.message);
  }
}

testCurseForge();