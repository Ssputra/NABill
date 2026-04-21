const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, 'frontend/pages');
if (fs.existsSync(dir)) {
  fs.readdirSync(dir).filter(f => f.endsWith('.html')).forEach(file => {
    const full = path.join(dir, file);
    let html = fs.readFileSync(full, 'utf8');
    html = html.replace(/<div class="brand-name">RT\/RW Billing<\/div>/g, '<div class="brand-name"></div>');
    fs.writeFileSync(full, html);
  });
  console.log('FOUC text cleaned');
}
