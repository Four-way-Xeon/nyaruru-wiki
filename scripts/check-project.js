'use strict';

const path = require('node:path');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const execute = promisify(execFile);

(async () => {
  const files = ['check-data.js', 'check-world-overview.js', 'check-icons.js', 'check-characters.js', 'check-save-parser.js', 'check-achievements.js', 'check-achievement-parser.js', 'check-endings.js', 'check-guides.js'];
  const results = await Promise.allSettled(files.map(file => execute(process.execPath, [path.join(__dirname, file)], { windowsHide:true })));
  for (let index = 0; index < results.length; index++) {
    const result = results[index];
    if (result.status === 'fulfilled') console.log(result.value.stdout.trim());
    else {
      console.error(files[index] + ': ' + (result.reason.stderr || result.reason.message));
      process.exitCode = 1;
    }
  }
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; });
