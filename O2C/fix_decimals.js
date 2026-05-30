const fs = require('fs');
const path = require('path');

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    file = path.join(dir, file);
    const stat = fs.statSync(file);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(file));
    } else if (file.endsWith('.jsx')) {
      results.push(file);
    }
  });
  return results;
}

const files = walk('./src');
files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');
  // We want to replace .toLocaleString('en-IN') or .toLocaleString() if it represents currency
  // Actually, replace .toLocaleString('en-IN') with .toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  // Need to be careful not to replace ones that already have options
  
  // Replace EXACTLY .toLocaleString('en-IN')
  let newContent = content.replace(/\.toLocaleString\('en-IN'\)/g, ".toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })");
  
  // also replace optionally chaining .toLocaleString('en-IN')
  // No, the regex above handles it (it matches the method call)
  
  if (content !== newContent) {
    fs.writeFileSync(file, newContent, 'utf8');
    /* console.log(`Updated ${file}`); */
  }
});
