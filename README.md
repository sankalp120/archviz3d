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
