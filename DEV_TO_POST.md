---
title: "PagedAttention: Navigating VRAM Fragmentation"
published: true
series: "Game to LLM"
description: "A Tetris-style educational game simulating GPU memory scheduling. Pack token request blocks contiguously to avoid OOM crashes, or deploy virtual PagedAttention tables to split and route pages into fragmentation gaps."
tags: ai, games, machinelearning, discuss
cover_image: "https://dev-to-uploads.s3.us-east-2.amazonaws.com/uploads/articles/eeg9ac38vadaw47gnuf3.jpeg"
---

Have you ever wondered how high-performance LLM deployment frameworks like vLLM, TensorRT-LLM, or Hugging Face TGI actually optimize model serving? While you wait for tokens to stream into your chat window, the infrastructure under the hood is executing a fragile balancing act: scheduling prompt pre-computation, paging memory segments, verifying speculative token chains, and dodging system-stalling bottleneck crashes.

To teach you how LLMs manage GPU memory under high concurrent loads, I built an interactive Tetris-style puzzle game:

## 🧱 PagedAttention: VRAM Tetris

{% embed https://paged-attention-166926259124.us-central1.run.app %}

{% cta https://paged-attention-166926259124.us-central1.run.app %} Play in Fullscreen Mode (if the embed sizing is tight) {% endcta %}

---

## 🛠️ Choose Your Allocation Mode

Your journey as a memory scheduler is split into two distinct memory allocation modes:

* **🏢 Contiguous Mode (Easy/Vanilla):** Stacking falling token sequence blocks (Tetrominos) into solid rows. Any gaps you leave behind are trapped, creating unusable **External Memory Fragmentation** that blocks new incoming allocations.
* **🔋 Paged Mode (PagedAttention - Hard):** Play with paged virtualization. Pressing **Shift or P** triggers a **Page Split**, shattering the active falling block into individual 1x1 memory pages that cascade down independently to fill any available fragmentation holes below.

---

## 🧬 Playable ML Concepts Explained

This isn't just standard Tetris—every shape, block placement, and allocation rule represents a real-world concept in modern machine learning infrastructure. Here is how the in-game mechanics map directly to how large language models allocate GPU memory:

### 1. 💾 Memory Allocation & Contiguity (Standard Stacking)
* **In-Game:** You must rotate and slide falling token block shapes to pack them together contiguously. Complete horizontal rows of memory blocks represent completed inference requests, which are garbage-collected to free up VRAM.
* **The Real-World Counterpart:** In standard serving systems, key-value representations (KV-Cache) of a sequence are allocated in a contiguous physical VRAM buffer.
* **How it affects LLMs:** Because the system doesn't know in advance how many tokens a query will generate, it must pre-allocate a contiguous space equal to the maximum sequence length. This pre-allocation locks up massive amounts of memory that may never be used, restricting concurrency.

---

### 2. 🗜️ External Memory Fragmentation (The Stacking Gaps)
* **In-Game:** Leaving empty spaces under your placed blocks represents external fragmentation. If VRAM fill spikes or blocks stack to the top, the engine crashes, throwing a **CUDA OUT OF MEMORY (OOM)** error.
* **The Real-World Counterpart:** Over time, as different requests finish at different times, the physical VRAM becomes cluttered with small, non-contiguous "gaps" of unallocated memory.
* **How it affects LLMs:** Even if you have 10 GB of total free VRAM, if it is split into 100 scattered megabyte-sized gaps, a new incoming request requiring a contiguous 1 GB block will fail—triggering a CUDA OOM crash because the allocator cannot defragment VRAM dynamically.

---

### 3. 🔋 PagedAttention Virtualization (The Page Split)
* **In-Game:** In Paged Mode, triggering a **Page Split** shatters the falling shape into individual 1x1 blocks that automatically drop down to seek out and fill the smallest hidden gaps in the memory grid.
* **The Real-World Counterpart:** Inspired by operating system virtual memory paging, **PagedAttention** (pioneered by vLLM) partitions the KV-cache of active sequences into logical blocks mapped to virtual tables.
* **How it affects LLMs:** By breaking the requirement of physical contiguity, the engine can write incoming token keys and values into any free physical slots on the graphics card, no matter how scattered. This eliminates 96% of memory waste, allowing up to 4x higher serving concurrency on the same hardware.

---

## 🛠️ The Under-the-Hood Engineering Journey

Creating an educational puzzle game designed for embedded platforms presented some fascinating web development challenges:

### 1. Optimizing for the 600px Embed Limit
Dev.to embeds are capped at a strict **maximum height of 600px**. Fitting a complex tycoon dashboard with side panels, scoreboards, next-piece canvases, and a 20-row Tetris grid inside 600px required serious spatial compression.
* **The Solution:** We shrank the cell block size (`BLOCK_SIZE`) to **22px** (yielding a 440px canvas height), converted the left panel stats list into a compact **2x2 grid**, resized preview boxes to **70px**, and relocated the system logs console from a horizontal footer directly into the left sidebar. The final layout fits completely inside exactly **580px**, preventing vertical clipping.

### 2. Physics of the Paged Cascading Split
Splitting a rigid grid structure into individual falling particles in real-time required careful synchronization.
* **The Solution:** When the split is triggered, the engine parses the active Tetromino shape, decomposes it into coordinate objects relative to the grid columns, calculates the lowest-available free cell index per column, and translates each block to its destination slot before recalculating line-clear sweeps.

---

### 💬 Let's Discuss:
* What is your high score in Paged Mode utilizing the Page Split ability?
* Did you notice how quickly a contiguous stack triggers a CUDA OOM compared to a paged system?
* How does VRAM Tetris change your perspective on memory allocation bottlenecks?

{% embed https://github.com/UnitBuilds-CC/PAGED-ATTENTION %}

*Disclaimer: AI was used throughout this project, it is just fitting that it would co-author with me, so special thanks to the Foundry for its tireless hours toiling away and Gemini for producing the cover image.*
