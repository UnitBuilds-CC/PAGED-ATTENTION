# 🧱 PagedAttention: VRAM Memory Allocation Tetris

An educational retro-cyberpunk Tetris-style simulator that maps classic block-packing gameplay directly to GPU memory allocation, external memory fragmentation, and virtual paging concepts.

👉 **[Play the Live Demo here!](https://paged-attention-166926259124.us-central1.run.app/)** *(Will be updated after deploy)*

---

## 🎮 The Concept

In **PagedAttention Tetris**, you play as a GPU memory scheduler. Incoming requests of varying token sizes (represented by falling Tetris shapes) must be allocated in the GPU's memory registers. Gaps left behind represent **External Memory Fragmentation**. If memory becomes too cluttered and blocks stack to the top, you trigger a **CUDA Out of Memory (OOM)** crash.

### Playable Memory Allocation Engines:
* 🏢 **Contiguous Mode:** Falling block sequences remain solid. If gaps are left underneath, they cannot be filled, causing fragmentation and system bloat.
* 🔋 **Paged Mode (PagedAttention):** Pressing `Shift` or `P` triggers a **Page Split**. The active falling block shatters into individual 1x1 block pages that cascade independently to fill all available fragmentation holes below, illustrating how virtual page tables bypass contiguous allocation constraints.

---

## 🧠 What It Teaches

* **External Memory Fragmentation:** Visually demonstrates how contiguous memory allocations leave unusable gaps (fragmentation) that lead to early memory exhaustion.
* **PagedAttention Concept:** Teaches how paging frameworks (like vLLM) divide sequential key-value caches into non-contiguous pages mapped by virtual page tables to eliminate fragmentation.
* **OOM Vulnerability:** Shows how high memory utilization and high fragmentation levels cause memory allocations to fail under load.

---

## 🛠️ Tech Stack & Highlights

* **Frontend:** HTML5 Canvas, responsive CSS grid layout suited for 600px heights (standard Dev.to embed size limit).
* **Audio:** Real-time Web Audio API sound synthesis (clicks, digital sweeps, clear chords, and warning buzzers).
* **Decoupled Physics Engine:** Fixed Timestep Accumulator loop (60 updates/sec) guaranteeing wall-clock accurate TPS calculations.
* **Pure Vanilla:** Light, zero-dependency ES6 Javascript.

---

## 🚀 How to Run Locally

1. Clone this repository:
   ```bash
   git clone https://github.com/UnitBuilds-CC/PAGED-ATTENTION.git
   cd PAGED-ATTENTION
   ```

2. Run a local web server:
   ```bash
   python -m http.server 8000
   ```

3. Open `http://localhost:8000` in your browser.
