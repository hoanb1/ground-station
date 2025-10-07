/**
 * @license
 * Copyright (c) 2025 Efstratios Goudelis
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


import * as React from "react";
import { useEffect, useState } from "react";
import { SignInPage } from "@toolpad/core";
import { Checkbox, Box, Typography, Paper, Avatar, CircularProgress } from "@mui/material";
import { useSocket } from './socket.jsx';
import toast from 'react-hot-toast';
import { useAuth } from "./auth.jsx";
import SatelliteAltIcon from '@mui/icons-material/SatelliteAlt';
import PersonIcon from '@mui/icons-material/Person';
import InputAdornment from '@mui/material/InputAdornment';

const LoginForm = ({ handleSignedInCallback }) => {
    const { socket } = useSocket();
    const [loading, setLoading] = useState(false);
    const { logIn } = useAuth();
    const [error, setError] = useState(null);

    // Update provider name to match username login
    const providers = [{ id: 'credentials', name: 'Username and password' }];

    const signIn = async (provider, formData) => {
        setError(null);
        setLoading(true);

        return new Promise((resolve, reject) => {
            const email = formData?.get('email');
            const password = formData?.get('password');

            logIn(email, password, (result) => {
                setLoading(false);
                if (!result.success) {
                    setError(result.error || 'Authentication failed');
                    reject(new Error(result.error || 'Authentication failed'));
                } else {
                    resolve(result);
                }
            });
        });
    };

    useEffect(() => {
        if (socket) {
            socket.on('connect', () => {
                setLoading(false);
            });

            socket.on("error", (error) => {
                setLoading(true);
                toast.error('Connection error: ' + error);
            });

            socket.on('disconnect', () => {
                setLoading(true);
                toast('Disconnected from server', { icon: '⚠️' });
            });
        }
        return () => {
            if (socket) {
                socket.off('connect');
                socket.off('error');
                socket.off('disconnect');
            }
        };
    }, [socket]);

    return (
        <Box
            sx={{

            }}
        >
            {error && (
                <Box
                    sx={{
                        mb: 2,
                        p: 1.5,
                        bgcolor: 'rgba(211, 47, 47, 0.15)',
                        border: '1px solid rgba(211, 47, 47, 0.3)'
                    }}
                >
                    <Typography color="error" variant="body2" sx={{ display: 'flex', alignItems: 'center' }}>
                        <Box component="span" sx={{ mr: 1 }}>⚠️</Box>
                        {error}
                    </Typography>
                </Box>
            )}

            <SignInPage
                sx={{
                    '& main > .MuiBox-root': {
                        backgroundColor: 'rgba(28, 28, 28, 1)',
                    },
                    '& .MuiFormLabel-root': {
                        color: 'rgba(255, 255, 255, 0.7)',
                    },
                    '& .MuiInputBase-input': {
                        color: '#fff',
                    },
                    '& .MuiOutlinedInput-root': {
                        transition: 'all 0.3s',
                        '& fieldset': {
                            borderColor: 'rgba(255, 255, 255, 0.23)',
                        },
                        '&:hover fieldset': {
                            borderColor: 'primary.main',
                        },
                        '&.Mui-focused fieldset': {
                            borderColor: 'primary.main',
                            borderWidth: 2,
                        },
                        '&.Mui-focused': {
                            boxShadow: '0 0 8px rgba(25, 118, 210, 0.4)',
                        }
                    },
                    // Override the label for email field
                    '& label[for="credentials-email"]': {
                        '&, &.Mui-focused': {
                            color: 'rgba(255, 255, 255, 0.7)',
                        },
                        '&::after': {
                            content: '"Username"',
                            display: 'block',
                            position: 'absolute',
                            top: 0,
                            left: 0,
                        },
                        '& span': {
                            display: 'none'
                        }
                    },
                }}
                hideHeader={true}
                signIn={signIn}
                providers={providers}
                slotProps={{
                    emailField: {
                        variant: 'outlined',
                        fullWidth: true,
                        margin: 'normal',
                        size: 'medium',
                        // Directly set a label that will appear on top of the field
                        label: "Username",
                        // Change placeholder to reflect username
                        placeholder: '',
                        // Change to text input to remove email validation
                        type: 'text',
                        // Add browser autocomplete for username
                        inputProps: {
                            autoComplete: 'username',
                        },
                        disabled: loading,
                        // Add a username icon to make it clear this is for username
                        InputProps: {
                            sx: {
                                backgroundColor: 'rgba(18, 18, 18, 0.6)',
                            }
                        }
                    },
                    passwordField: {
                        variant: 'outlined',
                        fullWidth: true,
                        margin: 'normal',
                        size: 'medium',
                        placeholder: '',
                        disabled: loading,
                        InputProps: {
                            sx: {
                                backgroundColor: 'rgba(18, 18, 18, 0.6)',
                            }
                        }
                    },
                    submitButton: {
                        variant: 'contained',
                        fullWidth: true,
                        size: 'large',
                        disableElevation: false,
                        color: 'primary',
                        disabled: loading,
                        // Update button text to match username login
                        children: 'Sign in with Username',
                        sx: {
                            mt: 3,
                            mb: 2,
                            height: 48,
                            fontWeight: 'bold',
                            position: 'relative',
                            background: 'linear-gradient(45deg, #1565c0 30%, #1976d2 90%)',
                            boxShadow: '0 3px 10px rgba(25, 118, 210, 0.5)',
                            transition: 'all 0.3s',
                            '&:hover': {
                                boxShadow: '0 6px 15px rgba(25, 118, 210, 0.6)',
                                transform: 'translateY(-1px)'
                            }
                        },
                        endIcon: loading ?
                            <CircularProgress size={20} color="inherit" /> : null
                    },
                    rememberMe: {
                        control: (
                            <Checkbox
                                name="rememberme"
                                checked={true}
                                value={"true"}
                                color="primary"
                                disabled={loading}
                                sx={{
                                    padding: 0.5,
                                    '& .MuiSvgIcon-root': {
                                        fontSize: 20
                                    },
                                    '&.Mui-checked': {
                                        color: '#1976d2'
                                    }
                                }}
                            />
                        ),
                        color: 'rgba(255, 255, 255, 0.7)',
                        label: 'Remember me',
                    },
                }}
            />
            <Typography
                variant="body2"
                sx={{
                    mt: 3,
                    color: 'rgba(255, 255, 255, 0.5)',
                    textAlign: 'center',
                    fontWeight: 300
                }}
            >
                © {new Date().getFullYear()} Ground Station. All rights reserved.
            </Typography>
        </Box>
    );
};

export default LoginForm;