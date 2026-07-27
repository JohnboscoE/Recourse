import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

interface NeuralBackgroundProps {
  className?: string;
  /**
   * Color of the particles.
   * Defaults to a cyan/indigo mix if not specified.
   */
  color?: string;
  /**
   * The opacity of the trails (0.0 to 1.0).
   * Lower = longer trails. Higher = shorter trails.
   * Default: 0.15
   */
  trailOpacity?: number;
  /**
   * Number of particles. Default: 600
   */
  particleCount?: number;
  /**
   * Speed multiplier. Default: 1
   */
  speed?: number;
  /**
   * Flow-field zoom. Higher = tighter, more turbulent curls;
   * lower = broader, calmer sweeps. Default: 1
   */
  scale?: number;
  /**
   * Colour the trails fade toward — should match the surface behind the canvas,
   * or trails will fade to the wrong colour and leave a haze. Default: black.
   */
  fadeColor?: string;
}

export default function NeuralBackground({
  className,
  color = "#6366f1", // Default Indigo
  trailOpacity = 0.15,
  particleCount = 600,
  speed = 1,
  scale = 1,
  fadeColor = "0, 0, 0",
}: NeuralBackgroundProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // --- CONFIGURATION ---
    let width = container.clientWidth;
    let height = container.clientHeight;
    let particles: Particle[] = [];
    let animationFrameId: number;
    const mouse = { x: -1000, y: -1000 }; // Start off-screen

    // Respect users who ask for less motion: render one static frame instead
    // of an endless animation.
    const prefersReducedMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;

    // --- PARTICLE CLASS ---
    class Particle {
      x = 0;
      y = 0;
      vx = 0;
      vy = 0;
      age = 0;
      life = 0;

      constructor() {
        this.reset();
      }

      update() {
        // 1. Flow Field Math (Simplex-ish noise)
        // We calculate an angle based on position to create the "flow"
        const freq = 0.005 * scale;
        const angle =
          (Math.cos(this.x * freq) + Math.sin(this.y * freq)) * Math.PI;

        // 2. Add force from flow field
        this.vx += Math.cos(angle) * 0.2 * speed;
        this.vy += Math.sin(angle) * 0.2 * speed;

        // 3. Mouse Repulsion
        const dx = mouse.x - this.x;
        const dy = mouse.y - this.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const interactionRadius = 150;

        if (distance < interactionRadius) {
          const force = (interactionRadius - distance) / interactionRadius;
          // Push away
          this.vx -= dx * force * 0.05;
          this.vy -= dy * force * 0.05;
        }

        // 4. Apply Velocity & Friction
        this.x += this.vx;
        this.y += this.vy;
        this.vx *= 0.95; // Friction to stop infinite acceleration
        this.vy *= 0.95;

        // 5. Aging
        this.age++;
        if (this.age > this.life) {
          this.reset();
        }

        // 6. Wrap around screen
        if (this.x < 0) this.x = width;
        if (this.x > width) this.x = 0;
        if (this.y < 0) this.y = height;
        if (this.y > height) this.y = 0;
      }

      reset() {
        this.x = Math.random() * width;
        this.y = Math.random() * height;
        this.vx = 0;
        this.vy = 0;
        this.age = 0;
        // Random lifespan to create natural recycling
        this.life = Math.random() * 200 + 100;
      }

      draw(context: CanvasRenderingContext2D) {
        context.fillStyle = color;
        // Fade in and out based on age
        const alpha = 1 - Math.abs(this.age / this.life - 0.5) * 2;
        context.globalAlpha = alpha;
        context.fillRect(this.x, this.y, 1.5, 1.5); // Tiny dots are faster than arcs
      }
    }

    // --- INITIALIZATION ---
    const init = () => {
      // Handle High-DPI screens (Retina).
      const dpr = window.devicePixelRatio || 1;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      // setTransform, not scale: scale() multiplies into the existing matrix,
      // so re-running this on every resize would compound the zoom.
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;

      particles = [];
      for (let i = 0; i < particleCount; i++) {
        particles.push(new Particle());
      }
    };

    const drawFrame = () => {
      // "Fade" effect: instead of clearing the canvas we draw a semi-transparent
      // rect over it, which leaves the trails behind.
      ctx.globalAlpha = 1;
      ctx.fillStyle = `rgba(${fadeColor}, ${trailOpacity})`;
      ctx.fillRect(0, 0, width, height);

      particles.forEach((p) => {
        p.update();
        p.draw(ctx);
      });
    };

    // --- ANIMATION LOOP ---
    const animate = () => {
      drawFrame();
      animationFrameId = requestAnimationFrame(animate);
    };

    // --- EVENT LISTENERS ---
    const handleResize = () => {
      const nextWidth = container.clientWidth;
      const nextHeight = container.clientHeight;
      // Ignore no-op resize events; re-initialising throws away every trail.
      if (nextWidth === width && nextHeight === height) return;
      width = nextWidth;
      height = nextHeight;
      init();
    };

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      mouse.x = e.clientX - rect.left;
      mouse.y = e.clientY - rect.top;
    };

    const handleMouseLeave = () => {
      mouse.x = -1000;
      mouse.y = -1000;
    };

    // Start
    init();
    if (prefersReducedMotion) {
      // A single settled frame: enough to read as texture, with no motion.
      for (let i = 0; i < 60; i++) drawFrame();
    } else {
      animate();
    }

    // clientWidth/Height also change when layout shifts without a window
    // resize, which a plain resize listener would miss.
    const observer = new ResizeObserver(handleResize);
    observer.observe(container);

    window.addEventListener("resize", handleResize);
    container.addEventListener("mousemove", handleMouseMove);
    container.addEventListener("mouseleave", handleMouseLeave);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", handleResize);
      container.removeEventListener("mousemove", handleMouseMove);
      container.removeEventListener("mouseleave", handleMouseLeave);
      cancelAnimationFrame(animationFrameId);
    };
  }, [color, trailOpacity, particleCount, speed, scale, fadeColor]);

  return (
    <div
      ref={containerRef}
      className={cn("relative w-full h-full bg-black overflow-hidden", className)}
    >
      <canvas ref={canvasRef} className="block w-full h-full" />
    </div>
  );
}
