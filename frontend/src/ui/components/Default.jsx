import React, { useCallback, useEffect, useState, useRef } from 'react'
import { Link } from 'react-router-dom';

const Default = () => {
    const canvasRef = useRef(null);
    const animationRef = useRef(null);
    const particlesRef = useRef([]);
    const mouseRef = useRef({ x: 0, y: 0 });

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) {
            console.error('Canvas ref is null!');
            return;
        }

        const ctx = canvas.getContext('2d');
        if (!ctx) {
            console.error('Could not get 2D context!');
            return;
        }
        
        // Set canvas size
        const resizeCanvas = () => {
            const container = canvas.parentElement;
            if (container) {
                canvas.width = container.clientWidth;
                canvas.height = container.clientHeight;
                console.log(`Canvas resized to: ${canvas.width}x${canvas.height}`);
            } else {
                // Fallback to window size
                canvas.width = window.innerWidth;
                canvas.height = window.innerHeight;
                console.log(`Canvas resized to window size: ${canvas.width}x${canvas.height}`);
            }
        };
        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);

        // Particle class with improved physics and bounds checking
        class Particle {
            constructor(x, y) {
                this.x = x || Math.random() * canvas.width;
                this.y = y || Math.random() * canvas.height;
                this.vx = (Math.random() - 0.5) * 3;
                this.vy = (Math.random() - 0.5) * 3;
                this.radius = Math.random() * 3 + 1;
                this.opacity = Math.random() * 0.5 + 0.3;
                this.maxSpeed = 5;
                this.baseVx = (Math.random() - 0.5) * 0.5;
                this.baseVy = (Math.random() - 0.5) * 0.5;
            }

            update() {
                // Add base movement to prevent particles from stopping
                this.vx += this.baseVx * 0.1;
                this.vy += this.baseVy * 0.1;

                // Enhanced mouse repulsion with stronger effect
                const dx = this.x - mouseRef.current.x;
                const dy = this.y - mouseRef.current.y;
                const distance = Math.sqrt(dx * dx + dy * dy);
                
                // Only apply repulsion if mouse position is valid (not -1000)
                if (mouseRef.current.x > -500 && distance > 0 && distance < 150) {
                    const force = (150 - distance) / 150;
                    const repelStrength = force * 1.2; // Increased strength
                    this.vx += (dx / distance) * repelStrength;
                    this.vy += (dy / distance) * repelStrength;
                    
                    // Add some visual feedback by changing opacity when near mouse
                    this.opacity = Math.min(0.8, this.opacity + force * 0.3);
                } else {
                    // Restore normal opacity when away from mouse
                    this.opacity = Math.max(0.3, this.opacity - 0.01);
                }

                // Limit velocity to prevent particles from going too fast
                const speed = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
                if (speed > this.maxSpeed) {
                    this.vx = (this.vx / speed) * this.maxSpeed;
                    this.vy = (this.vy / speed) * this.maxSpeed;
                }

                // Apply velocity with lighter damping
                this.vx *= 0.995;
                this.vy *= 0.995;
                
                // Update position
                this.x += this.vx;
                this.y += this.vy;

                // Improved boundary handling to prevent clustering
                const margin = 20; // Keep particles away from edges
                
                if (this.x <= margin) {
                    this.x = margin;
                    this.vx = Math.abs(this.vx) + Math.random() * 0.5;
                    this.vy += (Math.random() - 0.5) * 0.3; // Add some randomness
                }
                if (this.x >= canvas.width - margin) {
                    this.x = canvas.width - margin;
                    this.vx = -Math.abs(this.vx) - Math.random() * 0.5;
                    this.vy += (Math.random() - 0.5) * 0.3;
                }
                if (this.y <= margin) {
                    this.y = margin;
                    this.vy = Math.abs(this.vy) + Math.random() * 0.5;
                    this.vx += (Math.random() - 0.5) * 0.3;
                }
                if (this.y >= canvas.height - margin) {
                    this.y = canvas.height - margin;
                    this.vy = -Math.abs(this.vy) - Math.random() * 0.5;
                    this.vx += (Math.random() - 0.5) * 0.3;
                }

                // Add gentle force towards center if particles get too close to corners
                const centerX = canvas.width / 2;
                const centerY = canvas.height / 2;
                const distanceFromCenter = Math.sqrt((this.x - centerX) ** 2 + (this.y - centerY) ** 2);
                const maxDistance = Math.min(canvas.width, canvas.height) * 0.4;
                
                if (distanceFromCenter > maxDistance) {
                    const forceToCenter = 0.02;
                    this.vx += ((centerX - this.x) / distanceFromCenter) * forceToCenter;
                    this.vy += ((centerY - this.y) / distanceFromCenter) * forceToCenter;
                }

                // Prevent NaN values
                if (isNaN(this.x) || isNaN(this.y)) {
                    this.x = Math.random() * canvas.width;
                    this.y = Math.random() * canvas.height;
                    this.vx = (Math.random() - 0.5) * 2;
                    this.vy = (Math.random() - 0.5) * 2;
                }
            }

            draw() {
                if (ctx && !isNaN(this.x) && !isNaN(this.y)) {
                    ctx.beginPath();
                    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
                    ctx.fillStyle = `rgba(255, 255, 255, ${this.opacity})`;
                    ctx.fill();
                }
            }
        }

        // Initialize particles
        const initParticles = () => {
            particlesRef.current = [];
            for (let i = 0; i < 80; i++) {
                particlesRef.current.push(new Particle());
            }

        };

        // Draw connections
        const drawConnections = () => {
            for (let i = 0; i < particlesRef.current.length; i++) {
                for (let j = i + 1; j < particlesRef.current.length; j++) {
                    const dx = particlesRef.current[i].x - particlesRef.current[j].x;
                    const dy = particlesRef.current[i].y - particlesRef.current[j].y;
                    const distance = Math.sqrt(dx * dx + dy * dy);

                    if (distance < 150) {
                        const opacity = (150 - distance) / 150 * 0.4;
                        ctx.beginPath();
                        ctx.moveTo(particlesRef.current[i].x, particlesRef.current[i].y);
                        ctx.lineTo(particlesRef.current[j].x, particlesRef.current[j].y);
                        ctx.strokeStyle = `rgba(255, 255, 255, ${opacity})`;
                        ctx.lineWidth = 1;
                        ctx.stroke();
                    }
                }
            }
        };

        // Animation loop with error handling and performance monitoring
        let lastTime = 0;
        const animate = (currentTime) => {
            try {
                // Skip frame if too soon (60 FPS throttling)
                if (currentTime - lastTime < 16) {
                    animationRef.current = requestAnimationFrame(animate);
                    return;
                }
                lastTime = currentTime;

                // Clear canvas
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                
                // Update and draw particles
                particlesRef.current.forEach(particle => {
                    particle.update();
                    particle.draw();
                });
                
                // Draw connections
                drawConnections();
                
                // Continue animation
                animationRef.current = requestAnimationFrame(animate);
            } catch (error) {
                console.error("Animation error:", error);
                // Restart animation after error
                setTimeout(() => {
                    animationRef.current = requestAnimationFrame(animate);
                }, 100);
            }
        };

        // Global mouse tracking for better interaction
        const handleMouseMove = (e) => {
            const rect = canvas.getBoundingClientRect();
            const scaleX = canvas.width / rect.width;
            const scaleY = canvas.height / rect.height;
            
            mouseRef.current.x = (e.clientX - rect.left) * scaleX;
            mouseRef.current.y = (e.clientY - rect.top) * scaleY;
            
            // Debug: log mouse position (remove this later)
            // console.log(`Mouse: ${mouseRef.current.x.toFixed(0)}, ${mouseRef.current.y.toFixed(0)}`);
        };

        const handleMouseLeave = () => {
            // Move mouse position off screen to stop repulsion
            mouseRef.current.x = -1000;
            mouseRef.current.y = -1000;
        };

        const handleMouseEnter = (e) => {
            handleMouseMove(e);
        };

        const handleClick = (e) => {
            const rect = canvas.getBoundingClientRect();
            const clickX = e.clientX - rect.left;
            const clickY = e.clientY - rect.top;
            
            // Add new particles on click
            for (let i = 0; i < 4; i++) {
                const angle = (Math.PI * 2 * i) / 4 + Math.random() * 0.5;
                const distance = Math.random() * 50 + 20;
                const particle = new Particle(
                    clickX + Math.cos(angle) * distance,
                    clickY + Math.sin(angle) * distance
                );
                particlesRef.current.push(particle);
            }
            // Remove excess particles to maintain performance
            if (particlesRef.current.length > 150) {
                particlesRef.current.splice(0, particlesRef.current.length - 150);
            }
        };

        // Add event listeners with passive options for better performance
        canvas.addEventListener('mousemove', handleMouseMove, { passive: true });
        canvas.addEventListener('mouseenter', handleMouseEnter, { passive: true });
        canvas.addEventListener('mouseleave', handleMouseLeave, { passive: true });
        canvas.addEventListener('click', handleClick);
        
        // Also add document-level tracking as backup for better coverage
        const handleDocumentMouseMove = (e) => {
            const rect = canvas.getBoundingClientRect();
            const isOverCanvas = e.clientX >= rect.left && e.clientX <= rect.right && 
                                e.clientY >= rect.top && e.clientY <= rect.bottom;
            
            if (isOverCanvas) {
                const scaleX = canvas.width / rect.width;
                const scaleY = canvas.height / rect.height;
                mouseRef.current.x = (e.clientX - rect.left) * scaleX;
                mouseRef.current.y = (e.clientY - rect.top) * scaleY;
            }
        };
        
        document.addEventListener('mousemove', handleDocumentMouseMove, { passive: true });
        
        // Initialize mouse position
        mouseRef.current = { x: -1000, y: -1000 };

        // Add a small delay to ensure DOM is fully rendered
        setTimeout(() => {
            resizeCanvas(); // Resize again after DOM is ready
            initParticles();
            animate();
        }, 100);

        return () => {
            // Clean up all event listeners and animations
            window.removeEventListener('resize', resizeCanvas);
            document.removeEventListener('mousemove', handleDocumentMouseMove);
            if (canvas) {
                canvas.removeEventListener('mousemove', handleMouseMove);
                canvas.removeEventListener('mouseenter', handleMouseEnter);
                canvas.removeEventListener('mouseleave', handleMouseLeave);
                canvas.removeEventListener('click', handleClick);
            }
            if (animationRef.current) {
                cancelAnimationFrame(animationRef.current);
                animationRef.current = null;
            }
            // Clear particles array
            particlesRef.current = [];
        };
    }, []);

    const greetings = [
        "Welcome back! 👋",
        "Good to see you again 😊",
        "Hello there! 🚀",
        "Hope you're having a great day 🌞",
        "Hey, ready to get started? 💡",
        "What's up? 👀",
        "Glad you're here 🙌",
        "Let's make something awesome today 💻",
        "Your workspace is waiting ✨",
        "Nice to see you again 🔥",
        "Let's get things done ✅",
        "Back to business! 📊",
        "You’re doing amazing 🤩",
        "Keep up the great work 💪",
        "Let’s dive right in 🌊",
        "The journey continues 🚴",
        "Let’s build something cool 🛠️",
        "Another day, another win 🎉",
        "Focused and ready? 🎯",
        "It’s go time ⏱️",
        "Welcome to your dashboard 📋",
        "Your ideas matter 💡",
        "Time to create magic ✨",
        "Always moving forward ⏩",
        "Success starts here 🌟"
    ];

    const responses = [
        "Let's chat 💬",
        "Open conversation 🔓",
        "Take me to chat 🗨️",
        "Start chatting 🚀",
        "Go to messages 📩",
        "Let's talk 👂",
        "Jump into chat 💡",
        "Continue in chat 🔥",
        "Ask me something ❓",
        "Begin a new chat ➕",
        "Take me there 🏃",
        "Connect now 🌐",
        "Show me the chat window 🖥️",
        "Start a conversation 🗣️",
        "Head over to chat 📲",
        "Open the inbox 📥",
        "Tap to chat 👉",
        "Let's brainstorm 💭",
        "Go chat now ⚡",
        "Ready to talk? 🎤",
        "Chat time ⏱️",
        "Dive into chat 🌊",
        "Let's discuss 💬",
        "Your chat is waiting ✨",
        "Start messaging ✉️"
    ];

    const randomGreeting = greetings[Math.floor(Math.random() * greetings.length)];
    const randomResponse = responses[Math.floor(Math.random() * responses.length)];

    return (
        <div className="relative h-full w-full bg-black overflow-hidden">
            {/* Canvas Particles Background */}
            <canvas
                ref={canvasRef}
                className="absolute inset-0 w-full h-full"
                style={{ background: '#000000' }}
            />

            <div className="relative z-10 flex items-center justify-center h-full text-2xl font-semibold">
                <div className="text-center">
                    <p className='text-4xl text-white mb-4'>{randomGreeting}</p>
                    <div className='pt-6'>
                        <Link to="/app/Chat">
                            <p className='text-blue-400 hover:text-blue-300 transition-colors duration-200 cursor-pointer'>
                                {randomResponse}
                            </p>
                        </Link>
                    </div>
                    <div className="mt-4 text-xs text-gray-400">
                        Interactive Particles - Hover & Click!
                    </div>
                </div>
            </div>
        </div>
    )
}

export default Default
