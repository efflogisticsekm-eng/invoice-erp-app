import os
import glob

# Add CSS to index.css
with open('index.css', 'a') as f:
    f.write('''

/* PC View Enhancements */
@media (min-width: 768px) {
  #root {
    max-width: 1000px;
    margin: 0 auto;
  }
  
  .form-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 16px;
    align-items: start;
  }
  
  .form-grid > h2, 
  .form-grid > h3, 
  .form-grid > hr, 
  .form-grid > button,
  .form-grid > .full-width {
    grid-column: 1 / -1;
  }
  
  .form-grid > .input-group {
    margin-bottom: 0;
  }
}

@media (min-width: 1024px) {
  #root {
    max-width: 1200px;
  }
  .form-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}
''')

# Now apply form-grid class to forms and wrapper divs in jsx files
jsx_files = glob.glob('*.jsx')
for file in jsx_files:
    with open(file, 'r') as f:
        content = f.read()
    
    # 1. Add form-grid to forms with className="card"
    content = content.replace('className="card"', 'className="card form-grid"')
    
    # 2. Add form-grid to specific wrapper divs that contain multiple input-groups
    # A common pattern in this project is <div style={{ opacity: ... }}> wrapping inputs
    content = content.replace('style={{ opacity:', 'className="form-grid full-width" style={{ opacity:')
    
    with open(file, 'w') as f:
        f.write(content)

print("Patch applied!")
