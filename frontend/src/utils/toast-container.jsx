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

export const ToastContainerWithStyles = () => {
    return (
        <>
            <style>{`
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
                    background: linear-gradient(135deg, #1e4620 0%, #2d5a2f 100%) !important;
                    border-left: 4px solid #4caf50 !important;
                }

                .Toastify__toast--error {
                    background: linear-gradient(135deg, #4a1e1e 0%, #5a2d2d 100%) !important;
                    border-left: 4px solid #f44336 !important;
                }

                .Toastify__toast--warning {
                    background: linear-gradient(135deg, #4a3a1e 0%, #5a4a2d 100%) !important;
                    border-left: 4px solid #ff9800 !important;
                }

                .Toastify__toast--info {
                    background: linear-gradient(135deg, #1e3a4a 0%, #2d4a5a 100%) !important;
                    border-left: 4px solid #2196f3 !important;
                }

                .Toastify__progress-bar {
                    height: 3px !important;
                }

                .Toastify__close-button {
                    opacity: 0.7 !important;
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
                draggable={false}
                pauseOnHover={true}
                theme="dark"
                transition={Slide}
                toastClassName="custom-toast"
            />
        </>
    );
};
