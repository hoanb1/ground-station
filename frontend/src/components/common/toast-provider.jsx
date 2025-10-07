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

import toast, { Toaster, resolveValue } from 'react-hot-toast';

export const ToastProvider = ({ children }) => {
    return (
        <>
            <Toaster
                position="top-right"
                toastOptions={{
                    duration: 4000,
                }}
            >
                {(t) => (
                    <div
                        style={{
                            animation: t.visible
                                ? 'toast-enter-right 0.35s cubic-bezier(0.21, 1.02, 0.73, 1)'
                                : 'toast-exit-right 0.4s cubic-bezier(0.06, 0.71, 0.55, 1) forwards',
                            maxWidth: '400px',
                            width: '100%',
                            backgroundColor: t.type === 'success' ? '#1e3a1e' : t.type === 'error' ? '#3a1e1e' : '#2a2a2a',
                            boxShadow: '0 10px 25px rgba(0, 0, 0, 0.3)',
                            borderRadius: '8px',
                            pointerEvents: 'auto',
                            display: 'flex',
                            border: t.type === 'success' ? '1px solid #4caf50' : t.type === 'error' ? '1px solid #f44336' : '1px solid #404040',
                        }}
                    >
                        <div style={{ flex: 1, width: 0, padding: '16px' }}>
                            <div style={{ display: 'flex', alignItems: 'start' }}>
                                {t.icon && (
                                    <div style={{ flexShrink: 0, paddingTop: '2px', fontSize: '20px' }}>
                                        {t.icon}
                                    </div>
                                )}
                                <div style={{ marginLeft: t.icon ? '12px' : 0, flex: 1 }}>
                                    <p style={{
                                        fontSize: '14px',
                                        fontWeight: 500,
                                        color: '#ffffff',
                                        margin: 0,
                                        lineHeight: 1.5,
                                    }}>
                                        {resolveValue(t.message, t)}
                                    </p>
                                </div>
                            </div>
                        </div>
                        <div style={{ display: 'flex', borderLeft: '1px solid #404040' }}>
                            <button
                                onClick={() => toast.dismiss(t.id)}
                                style={{
                                    width: '100%',
                                    border: 'none',
                                    background: 'transparent',
                                    borderRadius: '0 8px 8px 0',
                                    padding: '16px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    fontSize: '13px',
                                    fontWeight: 500,
                                    color: t.type === 'success' ? '#66bb6a' : t.type === 'error' ? '#ef5350' : '#90caf9',
                                    cursor: 'pointer',
                                    transition: 'color 0.2s',
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.color = t.type === 'success' ? '#4caf50' : t.type === 'error' ? '#f44336' : '#64b5f6';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.color = t.type === 'success' ? '#66bb6a' : t.type === 'error' ? '#ef5350' : '#90caf9';
                                }}
                            >
                                Close
                            </button>
                        </div>
                    </div>
                )}
            </Toaster>
            <style>{`
                @keyframes toast-enter-right {
                    from {
                        transform: translateX(calc(100% + 40px));
                        opacity: 0;
                    }
                    to {
                        transform: translateX(0);
                        opacity: 1;
                    }
                }

                @keyframes toast-exit-right {
                    from {
                        transform: translateX(0);
                        opacity: 1;
                    }
                    to {
                        transform: translateX(calc(100% + 40px));
                        opacity: 0;
                    }
                }
            `}</style>
            {children}
        </>
    );
};
