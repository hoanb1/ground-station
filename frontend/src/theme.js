/**
 * @license
 * Copyright (c) 2024 Efstratios Goudelis
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 *
 */



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
                        //fontFamily: "Monospace, monospace",
                        //fontSize: "0.8rem",
                        //fontSpacing: "0.05rem",
                    }
                },
            },
            MuiMenuItem: {
                styleOverrides: {
                    root: {
                        //fontFamily: "Monospace, monospace",
                        //fontSize: "0.8rem",
                        //fontSpacing: "0.05rem",
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
            MuiFilledInput: {
                styleOverrides: {
                    root: {
                        backgroundColor: "#121212",
                    }
                },
            },
            MuiTextField: {
                styleOverrides: {
                    root: {
                        backgroundColor: "#121212",
                    }
                },
            }
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