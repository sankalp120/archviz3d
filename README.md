Archviz.3d

archviz.3d is an interactive web-based 3D architectural visualization editor built with Three.js
It allows users to design simple room layouts by placing walls and furniture, editing existing templates, and interacting with models in real time.

Start your project from one of several predefined templates:

Blank – empty scene for custom layouts
Studio – compact single-room design
Apartment – two-room apartment layout
Villa – spacious multi-room house
Office – work environment setup
Each template loads wall geometry and furniture placement from templates.json.



In the 3D Editor (editor.html):
Wall Placement – Click to draw connected walls, with live length preview
Furniture Library – Add models like sofa, chair, bed, lamp, etc.
Transform Controls – Move, rotate, or scale any object
Snap System – Grid-snapped placement and 15° rotation increments
Measurement Labels – Displays wall lengths dynamically
Selection Outline – Highlights the selected object in orange
Delete Tool – Remove selected walls or furniture
Lighting – Optimized hemisphere + directional lighting for clear visibility
Top-Down Camera View – Simplified architectural navigation

Project Structure
archviz3d/
├── index.html          # Template selection screen
├── editor.html         # Main 3D editor interface
├── editor.js           # Three.js scene setup, tools, controls
├── templates.json      # Preset layout data (walls + furniture)
└── public/
    └── models/         # GLB 3D models (e.g., sofa.glb, bed.glb, etc.)

How to Run:
Clone or download the repository.
Place it inside a local server environment (e.g., Live Server in VS Code).
Opening directly from file system will block JSON and model loading.
Open index.html in your browser.
Choose a template — the editor (editor.html) will open automatically.

Adding New Templates
You can create new templates by editing templates.json.
Each entry supports:

{
  "type": "wall",
  "start": [-3, 0],
  "end": [3, 0]
},
{
  "type": "furniture",
  "model": "Sofa",
  "pos": [1, 0, 2]
}


Add your custom template key and define wall/furniture objects accordingly.

Adding New Furniture Models

Export or download .glb models.
Place them inside public/models/.
Add the model name (without extension) to the dropdown list in editor.js.



Three.js
 – 3D rendering engine
GLTFLoader
 – for loading 3D models
OrbitControls
 – for scene navigation
TransformControls
 – for object manipulation


Template Selection (index.html):
Simple, minimal UI with neon-accented buttons for different templates.

Editor Interface (editor.html):
Full-screen 3D editor with toolbar controls, top-down camera, and shadow-enabled lighting.


This project is released under the MIT License.
You’re free to use, modify, and distribute it for both personal and commercial projects.
