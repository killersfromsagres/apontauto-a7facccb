import { createContext, useContext, useEffect, type ReactNode } from "react";

type Theme = "dark";
type ThemeContextValue = { theme: Theme; toggle: () => void; setTheme: (t: Theme) => void };

/**
 * Industrial Obsidian é um design system exclusivamente escuro.
 * O tema claro foi descontinuado para garantir contraste e identidade
 * consistentes em todas as páginas internas (nenhum fundo branco).
 */
const ThemeContext = createContext<ThemeContextValue>({
  theme: "dark",
  toggle: () => {},
  setTheme: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    document.documentElement.classList.add("dark");
    try {
      localStorage.setItem("theme", "dark");
    } catch {
      /* storage indisponível — o tema já está aplicado no <html> */
    }
  }, []);

  return (
    <ThemeContext.Provider value={{ theme: "dark", setTheme: () => {}, toggle: () => {} }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
