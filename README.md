# archviz.3d

A lightweight, browser-based 3D architectural visualization editor built with Three.js. This tool allows users to design floor plans, customize wall textures, place furniture models, and export their designs to JSON.

## Features

* Wall Construction: Point-and-click wall drawing system with automatic length measurement.

* Customization: Apply hex colors or seamless textures to walls (Brick, Concrete, Wood, etc.).

* Furniture Library: Integrated 3D model library with auto-generated thumbnails.

* Transformation Tools: Move, Rotate, and Scale objects with precision gizmos.

* Camera Modes: Toggle between Perspective (3D) and Orthographic (2D/ISO) views.

* State Management: Robust Undo/Redo system and JSON project Export/Import.

* Environment: Adjustable sun direction, lighting intensity, and dark/light UI modes.

Here is a comprehensive README.md file designed to serve as a user guide and tutorial for your ARCHVIZ.3D application.

ARCHVIZ.3D - User Guide & Documentation
ARCHVIZ.3D is a browser-based, zero-installation CAD system designed for rapid architectural prototyping. It seamlessly synchronizes 2D drafting with real-time 3D visualization, allowing users to draw floor plans, place furniture, and visualize spaces with dynamic lighting and textures.

🚀 Getting Started
Installation
No installation is required. This is a client-side web application.

Ensure all project files (index.html, app.html, editor.html, js files, and the public folder) are in the same directory.

Run a local server: Due to browser security restrictions (CORS) regarding loading textures and models, you cannot simply double-click the HTML files.

VS Code: Install the "Live Server" extension and click "Go Live" on index.html.

Python: Run python -m http.server in the terminal and navigate to localhost:8000.

Node: Use http-server or similar packages.

Launching the App
Open index.html in your browser.

Click the "VIEW DEMO" button in the "Live Execution" section to launch the application.

## Tutorial: How to Use
1. Project Selection
Upon launching the app, you will be taken to the Template Selection screen (app.html).

Templates: Choose a pre-made layout like Studio, Apartment, or Office to start with existing geometry.

Blank: Start a fresh project from an empty grid.

Load Data Module: Click to upload a previously saved .json project file to resume work.

2. The Editor Interface
Once in the editor (editor.html), the interface is divided into the 3D Viewport and the Floating Toolbar.

Navigation (3D Viewport)
Rotate: Left-click and drag.

Pan: Right-click and drag.

Zoom: Scroll wheel.

2D/3D Toggle: Click the "2D / 3D" button in the toolbar to switch between a Perspective view and a Top-down Orthographic view.

3. Constructing Walls
Enter Draw Mode: Click the "Draw Wall" button in the Construction panel. The button will turn active, and the cursor will change to a crosshair.

Draw:

Click once on the grid to set the Start Point.

Move your mouse to define the length (a preview line will appear).

Snap to Axis: Hold Shift while moving the mouse to lock the wall to the X or Z axis (straight lines).

Click again to set the End Point and create the wall.

Continuous Drawing: The end of your previous wall becomes the start of the new one, allowing you to trace rooms quickly.

Stop Drawing: Press Esc or click the "Stop Drawing" button to exit draw mode.

Tip: You can adjust the Grid Size and Wall Height using the input fields in the Construction panel before or after drawing.

4. Editing Objects
Selection: Click on any wall or furniture item to select it. It will be highlighted with a blue wireframe.

Multi-Select: Hold Shift and click multiple objects to select them all at once.

Transform Tools: Use the buttons at the top of the toolbar:

Move: Drag the gizmo arrows to move objects.

Rotate: Drag the rings to rotate objects.

Scale: Drag the blocks to resize objects (useful for furniture).

Deleting: Select an object and press Delete or click the "Del" button in the Project panel.

5. Customizing Appearance
With an object (or multiple objects) selected:

Paint/Tint: Use the color picker to change the wall paint or furniture tint.

Textures: Open the "Select Texture" dropdown to apply materials like Brick, Concrete, or Wood to walls and floors.

Mapping Scale: Use the Mapping slider to adjust how often the texture repeats (useful for fixing stretched textures on long walls).

6. Furniture Library
Click "Open Library" in the Furniture panel.

A dropdown with thumbnails will appear.

Click on any item (e.g., Sofa, Bed, Lamp) to spawn it into the scene.

Use the Move/Rotate tools to position it.

7. Importing Floor Plans (Tracing)
If you have a blueprint image:

Click "Import Floor Plan".

Select your image file (.jpg, .png).

The image will appear semi-transparently on the floor.

Enter "Draw Wall" mode to trace over the blueprint. The floor plan automatically hides when you exit draw mode.

8. Environment & Settings
Dark/Light Mode: Toggle the Sun icon to switch the UI and background theme.

Sun Intensity/Rotation: Adjust the sliders to change the lighting direction and brightness in real-time.

Smart Transparency: Toggle this to automatically fade out walls that block the camera's view of the interior.

## Controls


* Select Object : Left Click 
* Place Wall : Left Click (in Draw Mode)
* Pan Camera : Right Click + Drag
* Zoom : Scroll Wheel
* Delete Object : Delete/Backspace
* Cancel/Deselect : Esc 
* Undo : Ctrl + Z
* Redo : Ctrl + Y

## Project Structure
```
archviz.3d/
├── index.html          # Template selection screen
├── editor.html         # Main editor entry point
├── editor.js           # Core application logic
├── public/
│   ├── models/         # GLB furniture assets
│   ├── textures/       # JPG wall textures
│   └── templates.json  # Predefined layout data
└── README.md
```
