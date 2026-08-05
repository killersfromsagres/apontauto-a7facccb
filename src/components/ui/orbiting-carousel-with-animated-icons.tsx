"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mail, Briefcase, ChevronLeft, ChevronRight } from "lucide-react";

// --- Data: team members (14 collaborators) ---
const people = [
  {
    id: 1,
    name: "Anne H. Cavalcante",
    role: "ADM/RH",
    email: "anne.cavalcante@apontauto.com.br",
    profile: "https://placehold.co/400x400/E0E7FF/4338CA?text=AC",
  },
  {
    id: 2,
    name: "Adriana Gergye",
    role: "TST",
    email: "adriana.gergye@apontauto.com.br",
    profile: "https://placehold.co/400x400/E0E7FF/4338CA?text=AG",
  },
  {
    id: 3,
    name: "Carlos G. Marrese",
    role: "Coordenador de operações IFM",
    email: "carlos.marrese@apontauto.com.br",
    profile: "https://placehold.co/400x400/E0E7FF/4338CA?text=CM",
  },
  {
    id: 4,
    name: "Risomar P. Costa",
    role: "Supervisora Soft",
    email: "risomar.costa@apontauto.com.br",
    profile: "https://placehold.co/400x400/E0E7FF/4338CA?text=RC",
  },
  {
    id: 5,
    name: "Reynaldo Carpinetti",
    role: "Supervisor de manutenção",
    email: "reynaldo.carpinetti@apontauto.com.br",
    profile: "https://placehold.co/400x400/E0E7FF/4338CA?text=RC",
  },
  {
    id: 6,
    name: "Thalita T. Correa",
    role: "Mensageria",
    email: "thalita.correa@apontauto.com.br",
    profile: "https://placehold.co/400x400/E0E7FF/4338CA?text=TC",
  },
  {
    id: 7,
    name: "Debora Keiko",
    role: "Supervisora Uniformes",
    email: "debora.keiko@apontauto.com.br",
    profile: "https://placehold.co/400x400/E0E7FF/4338CA?text=DK",
  },
  {
    id: 8,
    name: "Edimacio Messias",
    role: "Encarregado Manutenção",
    email: "edimacio.messias@apontauto.com.br",
    profile: "https://placehold.co/400x400/E0E7FF/4338CA?text=EM",
  },
  {
    id: 9,
    name: "Zilda F. de Souza",
    role: "Líder Limpeza",
    email: "zilda.souza@apontauto.com.br",
    profile: "https://placehold.co/400x400/E0E7FF/4338CA?text=ZS",
  },
  {
    id: 10,
    name: "Jessica C. Barone",
    role: "Supervisora Serviços",
    email: "jessica.barone@apontauto.com.br",
    profile: "https://placehold.co/400x400/E0E7FF/4338CA?text=JB",
  },
  {
    id: 11,
    name: "Felipe França",
    role: "Encarregado Manutenção",
    email: "felipe.franca@apontauto.com.br",
    profile: "https://placehold.co/400x400/E0E7FF/4338CA?text=FF",
  },
  {
    id: 12,
    name: "Gabriel V. Lemos",
    role: "Planejador/Programador",
    email: "gabriel.lemos@apontauto.com.br",
    profile: "https://placehold.co/400x400/E0E7FF/4338CA?text=GL",
  },
  {
    id: 13,
    name: "José Erisvaldo",
    role: "Líder Jardinagem",
    email: "jose.erisvaldo@apontauto.com.br",
    profile: "https://placehold.co/400x400/E0E7FF/4338CA?text=JE",
  },
  {
    id: 14,
    name: "Solange Maria",
    role: "Líder Limpeza",
    email: "solange.maria@apontauto.com.br",
    profile: "https://placehold.co/400x400/E0E7FF/4338CA?text=SM",
  },
];

// --- Utility for fallback images ---
const safeImage = (e: React.SyntheticEvent) => {
  const target = e.target as HTMLImageElement;
  target.src = "https://placehold.co/100x100/E0E7FF/4338CA?text=Error";
};

// --- Custom hook for responsive detection ---
const useResponsive = () => {
  const [screenSize, setScreenSize] = React.useState<'xs' | 'sm' | 'md' | 'lg'>('lg');
  
  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    
    const checkScreenSize = () => {
      const width = window.innerWidth;
      if (width < 480) setScreenSize('xs');
      else if (width < 640) setScreenSize('sm');
      else if (width < 768) setScreenSize('md');
      else setScreenSize('lg');
    };
    
    checkScreenSize();
    window.addEventListener("resize", checkScreenSize);
    return () => window.removeEventListener("resize", checkScreenSize);
  }, []);
  
  return screenSize;
};

// --- Main Component ---
export default function OrbitCarousel() {
  const [activeIndex, setActiveIndex] = React.useState(0);
  const [isHovering, setIsHovering] = React.useState(false);
  const screenSize = useResponsive();

  // Responsive sizing
  const getResponsiveValues = () => {
    switch (screenSize) {
      case 'xs':
        return {
          containerRadius: 100,
          profileSize: 35, // Smaller profiles for more people
          cardWidth: 'w-36',
          avatarSize: 'w-10 h-10',
          avatarMargin: '-mt-8',
          fontSize: {
            name: 'text-sm',
            role: 'text-[10px]',
            email: 'text-[10px]'
          }
        };
      case 'sm':
        return {
          containerRadius: 130,
          profileSize: 45,
          cardWidth: 'w-40',
          avatarSize: 'w-12 h-12',
          avatarMargin: '-mt-9',
          fontSize: {
            name: 'text-base',
            role: 'text-xs',
            email: 'text-xs'
          }
        };
      case 'md':
        return {
          containerRadius: 180,
          profileSize: 55,
          cardWidth: 'w-44',
          avatarSize: 'w-14 h-14',
          avatarMargin: '-mt-10',
          fontSize: {
            name: 'text-base',
            role: 'text-sm',
            email: 'text-xs'
          }
        };
      default:
        return {
          containerRadius: 240, // Increased radius for 14 people
          profileSize: 65,
          cardWidth: 'w-52',
          avatarSize: 'w-18 h-18',
          avatarMargin: '-mt-12',
          fontSize: {
            name: 'text-lg',
            role: 'text-sm',
            email: 'text-xs'
          }
        };
    }
  };

  const { containerRadius, profileSize, cardWidth, avatarSize, avatarMargin, fontSize } = getResponsiveValues();
  // containerSize needs to accommodate the profiles orbiting
  const containerSize = containerRadius * 2 + profileSize * 2;

  // Calculate rotation for each profile
  const getRotation = React.useCallback(
    (index: number): number => (index - activeIndex) * (360 / people.length),
    [activeIndex]
  );

  // Navigation
  const next = () => setActiveIndex((i) => (i + 1) % people.length);
  const prev = () => setActiveIndex((i) => (i - 1 + people.length) % people.length);

  const handleProfileClick = React.useCallback((index: number) => {
    if (index === activeIndex) return;
    setActiveIndex(index);
  }, [activeIndex]);

  // Keyboard navigation
  React.useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'ArrowLeft') prev();
      else if (event.key === 'ArrowRight') next();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Auto-rotation
  React.useEffect(() => {
    if (isHovering) return;
    
    const interval = setInterval(() => {
      next();
    }, 5000);
    
    return () => clearInterval(interval);
  }, [isHovering]);

  return (
    <div 
      className="relative flex flex-col items-center justify-center min-h-[500px] w-full max-w-4xl mx-auto overflow-hidden"
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
    >
      <div 
        className="relative flex items-center justify-center transition-all duration-700 ease-in-out"
        style={{ 
          width: containerSize, 
          height: containerSize,
        }}
      >
        {/* Central Card */}
        <AnimatePresence mode="wait">
          <motion.div
            key={people[activeIndex].id}
            initial={{ opacity: 0, scale: 0.8, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: -20 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
            className={`absolute z-20 flex flex-col items-center p-6 rounded-3xl bg-white/10 dark:bg-black/20 backdrop-blur-xl border border-white/20 dark:border-white/10 shadow-2xl ${cardWidth}`}
          >
            <div className={`relative ${avatarSize} ${avatarMargin} mb-4`}>
              <img
                src={people[activeIndex].profile}
                alt={people[activeIndex].name}
                onError={safeImage}
                className="w-full h-full object-cover rounded-2xl shadow-xl border-2 border-white/50"
              />
            </div>

            <div className="text-center space-y-1">
              <h3 className={`font-bold text-white tracking-tight ${fontSize.name}`}>
                {people[activeIndex].name}
              </h3>
              
              <div className="flex items-center justify-center gap-1.5 opacity-80">
                <Briefcase className="w-3 h-3 text-indigo-400" />
                <span className={`text-white/90 font-medium ${fontSize.role}`}>
                  {people[activeIndex].role}
                </span>
              </div>

              <div className="flex items-center justify-center gap-1.5 opacity-60">
                <Mail className="w-3 h-3 text-indigo-300" />
                <span className={`text-white/70 truncate max-w-[120px] ${fontSize.email}`}>
                  {people[activeIndex].email}
                </span>
              </div>
            </div>
            
            <button className="mt-5 w-full py-2 px-4 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold rounded-xl transition-colors shadow-lg shadow-indigo-500/30">
              Ver Perfil
            </button>
          </motion.div>
        </AnimatePresence>

        {/* Orbiting Profiles */}
        {people.map((p, i) => {
          const rotation = getRotation(i);
          const isActive = i === activeIndex;
          
          return (
            <motion.div
              key={p.id}
              className="absolute"
              style={{
                width: profileSize,
                height: profileSize,
              }}
              animate={{
                rotate: rotation,
              }}
              transition={{
                duration: 0.8,
                ease: "circOut"
              }}
            >
              <motion.div
                className="w-full h-full"
                animate={{
                  rotate: -rotation,
                  scale: isActive ? 1.2 : 1,
                  opacity: isActive ? 1 : 0.6,
                }}
                transition={{
                  duration: 0.8,
                  ease: "circOut"
                }}
              >
                <img
                  src={p.profile}
                  alt={p.name}
                  onClick={() => handleProfileClick(i)}
                  onError={safeImage}
                  className={`w-full h-full object-cover rounded-full cursor-pointer transition-all duration-300 shadow-md ${
                    isActive 
                      ? "ring-4 ring-indigo-500 shadow-indigo-500/40" 
                      : "ring-2 ring-white/20 hover:ring-indigo-400/50 grayscale-[30%] hover:grayscale-0"
                  }`}
                  style={{
                    transform: `translateY(-${containerRadius}px)`
                  }}
                />
              </motion.div>
            </motion.div>
          );
        })}
      </div>

      {/* Controls */}
      <div className="mt-8 flex items-center gap-6 z-30">
        <button 
          onClick={prev}
          className="p-3 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 hover:text-white transition-all backdrop-blur-md"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        
        <div className="flex gap-2">
          {people.map((_, index) => (
            <motion.button
              key={index}
              onClick={() => setActiveIndex(index)}
              className={`w-2 h-2 rounded-full transition-colors ${
                index === activeIndex 
                  ? "bg-indigo-500 shadow-lg shadow-indigo-500/50" 
                  : "bg-white/20 hover:bg-white/40"
              }`}
              whileHover={{ scale: 1.4 }}
              whileTap={{ scale: 0.9 }}
            />
          ))}
        </div>

        <button 
          onClick={next}
          className="p-3 rounded-full bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 hover:text-white transition-all backdrop-blur-md"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}
