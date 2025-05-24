import { createContext, useContext, useState } from "react";
import { ThemeProvider as AmplifyThemeProvider } from "@aws-amplify/ui-react";

const ThemeContext = createContext();

export const useTheme = () => useContext(ThemeContext);

export const ThemeProvider = ({ children }) => {
  const [theme] = useState({
    name: "default",
    tokens: {
      colors: {
        primary: {
          10: "#f0f7ff",
          20: "#e0eefe",
          40: "#bcd9fe",
          60: "#80b5fb",
          80: "#4c94f5",
          90: "#3b82f6", // primary blue
          100: "#2563eb",
        },
        secondary: {
          80: "#14b8a6", // teal
        },
        accent: {
          80: "#f97316", // orange
        },
        success: {
          80: "#22c55e", // green
        },
        warning: {
          80: "#eab308", // yellow
        },
        error: {
          80: "#ef4444", // red
        },
        neutral: {
          10: "#f9fafb",
          20: "#f3f4f6",
          40: "#e5e7eb",
          60: "#d1d5db",
          80: "#9ca3af",
          90: "#6b7280",
          100: "#374151",
        },
        background: {
          primary: "#ffffff",
          secondary: "#f9fafb",
        },
        font: {
          primary: "#111827",
          secondary: "#4b5563",
          tertiary: "#9ca3af",
        },
        border: {
          primary: "#e5e7eb",
          secondary: "#d1d5db",
          focus: "#3b82f6",
        },
      },
      fonts: {
        default: {
          variable: { value: "Inter, system-ui, Avenir, Helvetica, Arial, sans-serif" },
          static: { value: "Inter, system-ui, Avenir, Helvetica, Arial, sans-serif" },
        },
      },
      space: {
        xs: { value: "0.25rem" },
        small: { value: "0.5rem" },
        medium: { value: "1rem" },
        large: { value: "1.5rem" },
        xl: { value: "2rem" },
        xxl: { value: "3rem" },
      },
      borderWidths: {
        small: { value: "1px" },
        medium: { value: "2px" },
        large: { value: "4px" },
      },
      radii: {
        xs: { value: "0.125rem" },
        small: { value: "0.25rem" },
        medium: { value: "0.5rem" },
        large: { value: "0.75rem" },
        xl: { value: "1rem" },
        circle: { value: "50%" },
      },
    },
  });

  return (
    <ThemeContext.Provider value={{ theme }}>
      <AmplifyThemeProvider theme={theme} colorMode="light">
        {children}
      </AmplifyThemeProvider>
    </ThemeContext.Provider>
  );
};