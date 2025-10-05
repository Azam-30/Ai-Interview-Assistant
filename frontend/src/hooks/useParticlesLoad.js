import { useEffect } from 'react';

// This hook loads the particles.js script from CDN
const useParticlesLoad = () => {
    useEffect(() => {
        const scriptId = 'particles-js-script';
        
        // Check if the script is already loaded
        if (document.getElementById(scriptId)) return;

        // Load particles.js library
        const script = document.createElement('script');
        script.id = scriptId;
        script.src = 'https://cdn.jsdelivr.net/particles.js/2.0.0/particles.min.js';
        script.onload = () => {
            console.log('particles.js loaded via CDN');
            // Once the library is loaded, run the initialization logic
            if (window.particlesJS) {
                window.particlesJS('particles-js', {
                    // This is your particle configuration translated to the old particles.js format
                    particles: {
                        number: { value: 60, density: { enable: true, value_area: 800 } },
                        color: { value: ["#E45A92", "#FFACAC"] },
                        shape: { type: "circle" },
                        opacity: { value: 0.5, random: true, anim: { enable: true, speed: 1, opacity_min: 0.05, sync: false } },
                        size: { value: 3, random: true, anim: { enable: false } },
                        line_linked: { enable: false },
                        move: { enable: true, speed: 1, direction: "top", random: true, straight: false, out_mode: "out" },
                    },
                    interactivity: { detect_on: "canvas", events: { onhover: { enable: false }, onclick: { enable: false }, resize: true } },
                    retina_detect: true,
                    // The old library requires a background color defined in the config, 
                    // even if we set it to transparent.
                    background: { color: "transparent" } 
                });
            }
        };
        document.body.appendChild(script);

        return () => {
            // Cleanup function if component unmounts
            // We'll leave the script loaded to prevent rapid reloads
        };
    }, []);
};

export default useParticlesLoad;