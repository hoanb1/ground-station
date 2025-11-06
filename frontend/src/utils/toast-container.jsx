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

import React from 'react';
import { ToastContainer, Slide } from 'react-toastify';
import { useTheme } from '@mui/material/styles';

export const ToastContainerWithStyles = () => {
    const theme = useTheme();

    return (
        <>
            <style>{`
                .Toastify__toast-container {
                    top: 75px !important;
                    z-index: 1299 !important;
                }

                .Toastify__toast-container,
                .Toastify__toast,
                .Toastify__toast-body,
                .Toastify__toast-body > div {
                    font-family: 'Roboto', sans-serif !important;
                    font-size: 14px !important;
                }

                .Toastify__toast {
                    border-radius: 8px !important;
                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.5) !important;
                    padding: 10px !important;
                    min-height: 64px !important;
                    backdrop-filter: blur(10px);
                }

                .Toastify__toast--success {
                    background: ${theme.palette.success.main} !important;
                    border-left: 4px solid ${theme.palette.success.main} !important;
                    color: ${theme.palette.success.contrastText} !important;
                }

                .Toastify__toast--error {
                    background: ${theme.palette.error.main} !important;
                    border-left: 4px solid ${theme.palette.error.main} !important;
                    color: ${theme.palette.error.contrastText} !important;
                }

                .Toastify__toast--warning {
                    background: ${theme.palette.warning.main} !important;
                    border-left: 4px solid ${theme.palette.warning.main} !important;
                    color: ${theme.palette.warning.contrastText} !important;
                }

                .Toastify__toast--info {
                    background: ${theme.palette.info.main} !important;
                    border-left: 4px solid ${theme.palette.info.main} !important;
                    color: ${theme.palette.info.contrastText} !important;
                }

                .Toastify__progress-bar--success {
                    background: ${theme.palette.success.contrastText} !important;
                }

                .Toastify__progress-bar--error {
                    background: ${theme.palette.error.contrastText} !important;
                }

                .Toastify__progress-bar--warning {
                    background: ${theme.palette.warning.contrastText} !important;
                }

                .Toastify__progress-bar--info {
                    background: ${theme.palette.info.contrastText} !important;
                }

                .Toastify__progress-bar {
                    height: 4px !important;
                    opacity: 0.8 !important;
                }

                .Toastify__close-button {
                    opacity: 0.7 !important;
                    color: ${theme.palette.text.primary} !important;
                }

                .Toastify__close-button:hover {
                    opacity: 1 !important;
                }

                .Toastify__toast-body {
                    white-space: pre-line !important;
                }
            `}</style>
            <ToastContainer
                position="top-right"
                autoClose={4000}
                hideProgressBar={false}
                newestOnTop={false}
                closeOnClick={false}
                rtl={false}
                pauseOnFocusLoss={true}
                draggable={true}
                draggablePercent={30}
                pauseOnHover={true}
                theme={theme.palette.mode}
                transition={Slide}
                toastClassName="custom-toast"
            />
        </>
    );
};
