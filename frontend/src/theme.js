import { createTheme } from "@mui/material";

export function setupTheme() {
    const palette = {
        primary: {
            main: "#406da4",
        },
        secondary: {
            main: "#E6EEF2",
            dark: "#CFDDE5",
        },
        text: {
            primary: "#555",
        },
        background: {
            main: "#fff",
        },
    };

    return createTheme({
        palette,
        shape: {
            borderRadius: 10,
        },
        typography: {
            htmlFontSize: 10,
            fontFamily: "Roboto, Arial, sans-serif",
            h1: {
                fontSize: "3rem",
            },
            h2: {
                fontSize: "2.7rem",
            },
            h3: {
                fontSize: "2.5rem",
            },
            body1: {
                fontSize: "1.4rem",
            },
            body2: {
                fontSize: "1.2rem",
            },
            body3: {
                fontSize: "1.25rem",
            },
        },
        components: {
            MuiCssBaseline: {
                styleOverrides: ({ palette }) => {
                    return `
                   html {
                      font-size: 62.5%;
                   }  
                   *::-webkit-scrollbar {
                      height: 8px;
                      width: 8px;
                   }
                   *::-webkit-scrollbar-track {
                      border-radius: 4px;
                      background-color: ${palette.secondary.main};
                   }
                    *::-webkit-scrollbar-track:hover {
                      background-color: ${palette.secondary.dark};
                    }
                    *::-webkit-scrollbar-track:active {
                      background-color: ${palette.secondary.dark};
                    }
                `;
                }
            },
            MuiButton: {
                styleOverrides: {
                    borderRadius: 20,
                    fontWeight: "bold",
                },
                defaultProps: {
                    variant: "contained",
                    disableElevation: true,
                },
            },
            MuiStack: {
                defaultProps: {
                    gap: 2,
                },
            },
        },
    });
}