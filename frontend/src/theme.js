import {createTheme} from "@mui/material";

export function setupTheme() {
    const palette = {
        mode: 'dark',
    }

    return createTheme({
        palette,
        background: {
            paper: "#1e1e1e",
        },
        cssVariables: {
            colorSchemeSelector: 'data-toolpad-color-scheme',
        },
        shape: {
            //borderRadius: 4,
        },
        typography: {
            //htmlFontSize: 16,
            fontFamily: "Roboto, Arial, sans-serif",
            // h1: {
            //     fontSize: "3rem",
            // },
            // h2: {
            //     fontSize: "2.7rem",
            // },
            // h3: {
            //     fontSize: "2.5rem",
            // },
            // body1: {
            //     fontSize: "1.4rem",
            // },
            // body2: {
            //     fontSize: "1.2rem",
            // },
            // body3: {
            //     fontSize: "1.25rem",
            // },
        },
        components: {
            MuiCssBaseline: {
                styleOverrides: ({palette}) => {
                    return `
                   // html {
                   //    font-size: 62.5%;
                   // }
                   // *::-webkit-scrollbar {
                   //    height: 8px;
                   //    width: 8px;
                   // }
                   // *::-webkit-scrollbar-track {
                   //    border-radius: 4px;
                   //    background-color: ${palette.secondary.main};
                   // }
                   //  *::-webkit-scrollbar-track:hover {
                   //    background-color: ${palette.secondary.dark};
                   //  }
                   //  *::-webkit-scrollbar-track:active {
                   //    background-color: ${palette.secondary.dark};
                   //  }
                `;
                }
            },
            MuiDrawer: {
                styleOverrides: {
                    paper: {
                        backgroundColor: "#1e1e1e",
                        borderRight: "1px solid #4b4b4b",
                    },
                },
            },
            MuiAppBar: {
                styleOverrides: {
                    root: {
                        backgroundColor: "#071318",
                    },
                },
            },
            MuiSelect: {
                styleOverrides: {
                    root: {
                        backgroundColor: "#121212",
                    }
                },
            },
            MuiAutocomplete: {
                styleOverrides: {
                    root: {
                        backgroundColor: "#121212",
                    }
                },
            },
            MuiListSubheader: {
                styleOverrides: {
                    root: {
                        backgroundColor: "#1e1e1e",
                    }
                },
            },
            // MuiAppBar: {
            //     styleOverrides: {
            //         backgroundColor: "#1e1e1e",
            //     }
            // },
            // MuiButton: {
            //     styleOverrides: {
            //         borderRadius: 20,
            //         fontWeight: "bold",
            //     },
            //     defaultProps: {
            //         variant: "contained",
            //         disableElevation: true,
            //     },
            // },
            // MuiStack: {
            //     defaultProps: {
            //         gap: 2,
            //     },
            // },
        },
    });
}