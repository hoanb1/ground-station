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
import { useCallback, useEffect, useRef, useState } from "react";
import { useSelector, useDispatch } from "react-redux";
import { useSocket } from "../common/socket.jsx";
import { useTranslation } from 'react-i18next';
import { removeTask } from './tasks-slice.jsx';
import {
    Box,
    IconButton,
    Popover,
    Typography,
    List,
    ListItem,
    ListItemText,
    Chip,
    LinearProgress,
    Button,
    Divider,
    Stack,
    Paper,
    Tooltip,
} from "@mui/material";
import PlaylistPlayIcon from '@mui/icons-material/PlaylistPlay';
import StopIcon from '@mui/icons-material/Stop';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import ErrorIcon from '@mui/icons-material/Error';
import CancelIcon from '@mui/icons-material/Cancel';
import DeleteSweepIcon from '@mui/icons-material/DeleteSweep';

// Terminal output component with auto-scroll
const TaskOutputTerminal = ({ task }) => {
    const terminalRef = useRef(null);

    // Auto-scroll to bottom when new output arrives
    useEffect(() => {
        if (terminalRef.current) {
            terminalRef.current.scrollTop = terminalRef.current.scrollHeight;
        }
    }, [task.output_lines]);

    return (
        <Paper
            ref={terminalRef}
            variant="outlined"
            sx={{
                p: 1,
                maxHeight: 100,
                overflow: 'auto',
                bgcolor: 'background.default',
                fontSize: '0.75rem',
                fontFamily: 'monospace',
            }}
        >
            {task.output_lines.slice(-1000).map((line, idx) => {
                const parts = parseAnsiColors(line.output);
                return (
                    <Typography key={idx} variant="caption" component="div" sx={{ fontFamily: 'monospace' }}>
                        {parts.map((part, partIdx) => (
                            <span
                                key={partIdx}
                                style={{
                                    color: part.color || 'inherit',
                                    fontWeight: part.bold ? 'bold' : 'normal',
                                }}
                            >
                                {part.text}
                            </span>
                        ))}
                    </Typography>
                );
            })}
        </Paper>
    );
};

// Parse ANSI color codes and convert to styled spans
const parseAnsiColors = (text) => {
    // Remove replacement characters (�) and other invalid UTF-8
    text = text.replace(/\uFFFD/g, '');
    // Normalize ANSI escape sequences by stripping ESC so "[...m" can be parsed.
    text = text.replace(/\u001b/g, '');

    const ansiRegex = /\[(\d*(?:;\d+)*)m/g;
    const parts = [];
    let lastIndex = 0;
    let currentColor = null;
    let currentBold = false;

    const matches = [...text.matchAll(ansiRegex)];

    for (const match of matches) {
        // Add text before this code
        if (match.index > lastIndex) {
            const textPart = text.substring(lastIndex, match.index);
            parts.push({
                text: textPart,
                color: currentColor,
                bold: currentBold,
            });
        }

        // Parse color code
        const codeString = match[1];
        const codes = codeString ? codeString.split(';') : ['0'];
        for (const code of codes) {
            if (code === '0') {
                // Reset
                currentColor = null;
                currentBold = false;
            } else if (code === '1') {
                currentBold = true;
            } else if (code === '22') {
                currentBold = false;
            } else if (code === '30') currentColor = '#000000';
            else if (code === '31') currentColor = '#ff4444';
            else if (code === '32') currentColor = '#44ff44';
            else if (code === '33') currentColor = '#ffff44';
            else if (code === '34') currentColor = '#4444ff';
            else if (code === '35') currentColor = '#ff44ff';
            else if (code === '36') currentColor = '#44ffff';
            else if (code === '37') currentColor = '#ffffff';
            else if (code === '90') currentColor = '#666666';
            else if (code === '91') currentColor = '#ff6666';
            else if (code === '92') currentColor = '#66ff66';
            else if (code === '93') currentColor = '#ffff66';
            else if (code === '94') currentColor = '#6666ff';
            else if (code === '95') currentColor = '#ff66ff';
            else if (code === '96') currentColor = '#66ffff';
            else if (code === '97') currentColor = '#ffffff';
        }

        lastIndex = match.index + match[0].length;
    }

    // Add remaining text
    if (lastIndex < text.length) {
        parts.push({
            text: text.substring(lastIndex),
            color: currentColor,
            bold: currentBold,
        });
    }

    return parts;
};

const BackgroundTasksPopover = () => {
    const { t } = useTranslation('dashboard');
    const { socket } = useSocket();
    const dispatch = useDispatch();
    const buttonRef = useRef(null);
    const [anchorEl, setAnchorEl] = useState(null);
    const [connected, setConnected] = useState(false);
    const [hideIcon, setHideIcon] = useState(false);

    // Get tasks from Redux store
    const { tasks, runningTaskIds, completedTaskIds } = useSelector(state => state.backgroundTasks);

    // Check if there are any failed or stopped tasks
    const hasFailedTasks = completedTaskIds.some(taskId => {
        const task = tasks[taskId];
        return task && task.status === 'failed';
    });

    const hasStoppedTasks = completedTaskIds.some(taskId => {
        const task = tasks[taskId];
        return task && task.status === 'stopped';
    });

    // Determine if there are any tasks (running or completed)
    const hasTasks = runningTaskIds.length > 0 || completedTaskIds.length > 0;

    // Only show icon if there are tasks and we're not in the hiding transition
    const shouldShowIcon = connected && hasTasks;

    // Socket connection event handlers
    useEffect(() => {
        if (!socket) return;

        const handleConnect = () => {
            setConnected(true);
        };

        const handleDisconnect = () => {
            setConnected(false);
        };

        socket.on('connect', handleConnect);
        socket.on('disconnect', handleDisconnect);

        return () => {
            socket.off('connect', handleConnect);
            socket.off('disconnect', handleDisconnect);
        };
    }, [socket]);

    // Show icon whenever there are tasks
    useEffect(() => {
        if (hasTasks) {
            setHideIcon(false);
        }
    }, [hasTasks]);

    const handleClick = (event) => {
        if (!connected) return;
        setAnchorEl(event.currentTarget);
    };

    const handleClose = () => {
        setAnchorEl(null);
    };

    const handleStopTask = useCallback((taskId) => {
        if (!socket) return;
        socket.emit('background_task:stop', { task_id: taskId, timeout: 5.0 }, (response) => {
            if (!response.success) {
                console.error('Failed to stop task:', response.error);
            }
        });
    }, [socket]);

    const handleClearCompleted = useCallback(() => {
        // Remove all completed tasks (completed, failed, stopped)
        completedTaskIds.forEach(taskId => {
            dispatch(removeTask(taskId));
        });

        // If no running tasks remain after clearing, close popover and hide the icon
        if (runningTaskIds.length === 0) {
            // Close popover first
            setAnchorEl(null);
            // Then hide icon after popover closes (300ms transition)
            setTimeout(() => {
                setHideIcon(true);
            }, 300);
        }
    }, [completedTaskIds, runningTaskIds, dispatch]);

    const open = Boolean(anchorEl);

    // Determine icon color based on task states
    const getIconColor = () => {
        if (!connected) return 'text.disabled';
        if (hasFailedTasks) return 'error.main';
        if (runningTaskIds.length > 0) return 'info.main';
        if (hasStoppedTasks) return 'warning.main';
        return 'text.secondary';
    };

    const getTooltip = () => {
        if (!connected) return t('tasks_popover.socket_disconnected', 'Socket Disconnected');
        const runningCount = runningTaskIds.length;
        const failedCount = completedTaskIds.filter(taskId => tasks[taskId]?.status === 'failed').length;

        if (hasFailedTasks && runningCount > 0) {
            return t('tasks_popover.running_and_failed', { running: runningCount, failed: failedCount }, `${runningCount} running, ${failedCount} failed`);
        }
        if (hasFailedTasks) {
            return t('tasks_popover.failed_tasks', { count: failedCount }, `${failedCount} task(s) failed`);
        }
        if (runningCount > 0) {
            return t('tasks_popover.running_tasks', { count: runningCount }, `${runningCount} task(s) running`);
        }
        return t('tasks_popover.no_tasks', 'No background tasks');
    };

    const getStatusChip = (status) => {
        switch (status) {
            case 'running':
                return <Chip label="Running" size="small" color="info" icon={<PlaylistPlayIcon />} />;
            case 'completed':
                return <Chip label="Completed" size="small" color="success" icon={<CheckCircleIcon />} />;
            case 'failed':
                return <Chip label="Failed" size="small" color="error" icon={<ErrorIcon />} />;
            case 'stopped':
                return <Chip label="Stopped" size="small" color="warning" icon={<CancelIcon />} />;
            default:
                return <Chip label={status} size="small" />;
        }
    };

    const formatDuration = (ms) => {
        if (!ms) return '';
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);

        if (hours > 0) {
            return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
        } else if (minutes > 0) {
            return `${minutes}m ${seconds % 60}s`;
        } else {
            return `${seconds}s`;
        }
    };

    const renderTaskItem = (taskId) => {
        const task = tasks[taskId];
        if (!task) return null;

        const isRunning = task.status === 'running';
        // Convert start_time from seconds (Python) to milliseconds (JavaScript)
        const startTimeMs = task.start_time * 1000;
        const endTimeMs = task.end_time ? task.end_time * 1000 : null;

        const duration = endTimeMs
            ? (task.duration ? task.duration * 1000 : endTimeMs - startTimeMs)
            : Date.now() - startTimeMs;

        return (
            <ListItem key={taskId} divider>
                <Stack direction="column" spacing={1} sx={{ width: '100%' }}>
                    <Stack direction="row" justifyContent="space-between" alignItems="center">
                        <Typography variant="subtitle2" fontWeight="bold">
                            {task.name}
                        </Typography>
                        {getStatusChip(task.status)}
                    </Stack>

                    <Typography variant="caption" color="text.secondary">
                        {task.command} {task.args?.join(' ').substring(0, 50)}
                        {task.args?.join(' ').length > 50 ? '...' : ''}
                    </Typography>

                    {isRunning && (
                        <>
                            {task.progress !== undefined && task.progress !== null ? (
                                <Box>
                                    <LinearProgress variant="determinate" value={task.progress} />
                                    <Typography variant="caption" color="text.secondary" sx={{ mt: 0.5 }}>
                                        Progress: {Math.round(task.progress)}%
                                    </Typography>
                                </Box>
                            ) : (
                                <LinearProgress />
                            )}
                            <Stack direction="row" justifyContent="space-between" alignItems="center">
                                <Typography variant="caption" color="text.secondary">
                                    Duration: {formatDuration(duration)}
                                </Typography>
                                <Button
                                    size="small"
                                    color="error"
                                    startIcon={<StopIcon />}
                                    onClick={() => handleStopTask(taskId)}
                                >
                                    Stop
                                </Button>
                            </Stack>
                        </>
                    )}

                    {!isRunning && (
                        <Typography variant="caption" color="text.secondary">
                            Duration: {formatDuration(duration)}
                            {task.return_code !== null && ` | Exit code: ${task.return_code}`}
                        </Typography>
                    )}

                    {task.output_lines && task.output_lines.length > 0 && (
                        <TaskOutputTerminal task={task} />
                    )}
                </Stack>
            </ListItem>
        );
    };

    return (
        <>
            <Tooltip title={getTooltip()}>
                <IconButton
                    ref={buttonRef}
                    onClick={handleClick}
                    disabled={!connected}
                    sx={{
                        color: getIconColor(),
                        position: 'relative',
                        display: hideIcon ? 'none' : 'inline-flex',
                    }}
                >
                    <PlaylistPlayIcon />
                    {runningTaskIds.length > 0 && (
                        <Box
                            sx={{
                                position: 'absolute',
                                top: 4,
                                right: 4,
                                bgcolor: hasFailedTasks ? 'error.main' : 'info.main',
                                borderRadius: '50%',
                                width: 12,
                                height: 12,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: '0.6rem',
                                color: 'white',
                                fontWeight: 'bold',
                            }}
                        >
                            {runningTaskIds.length}
                        </Box>
                    )}
                </IconButton>
            </Tooltip>

            <Popover
                open={open}
                anchorEl={anchorEl}
                onClose={handleClose}
                anchorOrigin={{
                    vertical: 'bottom',
                    horizontal: 'right',
                }}
                transformOrigin={{
                    vertical: 'top',
                    horizontal: 'right',
                }}
            >
                <Box sx={{ width: 500, maxHeight: 600, display: 'flex', flexDirection: 'column' }}>
                    {/* Sticky Header */}
                    <Box sx={{ p: 2, borderBottom: 1, borderColor: 'divider' }}>
                        <Stack direction="row" justifyContent="space-between" alignItems="center">
                            <Typography variant="h6">
                                {t('tasks_popover.title', 'Background Tasks')}
                            </Typography>
                            {completedTaskIds.length > 0 && (
                                <Button
                                    size="small"
                                    startIcon={<DeleteSweepIcon />}
                                    onClick={handleClearCompleted}
                                >
                                    {t('tasks_popover.clear_completed', 'Clear Completed')}
                                </Button>
                            )}
                        </Stack>
                    </Box>

                    {/* Scrollable Body */}
                    <Box sx={{ overflow: 'auto', flex: 1 }}>
                        {runningTaskIds.length === 0 && completedTaskIds.length === 0 && (
                            <Box sx={{ p: 3, textAlign: 'center' }}>
                                <Typography color="text.secondary">
                                    {t('tasks_popover.no_tasks_message', 'No background tasks')}
                                </Typography>
                            </Box>
                        )}

                        {runningTaskIds.length > 0 && (
                            <>
                                <Box sx={{ p: 2 }}>
                                    <Typography variant="subtitle2" color="text.secondary">
                                        {t('tasks_popover.running_section', 'Running')} ({runningTaskIds.length})
                                    </Typography>
                                </Box>
                                <List disablePadding>
                                    {runningTaskIds.map(taskId => renderTaskItem(taskId))}
                                </List>
                            </>
                        )}

                        {completedTaskIds.length > 0 && (
                            <>
                                {runningTaskIds.length > 0 && <Divider />}
                                <Box sx={{ p: 2 }}>
                                    <Typography variant="subtitle2" color="text.secondary">
                                        {t('tasks_popover.completed_section', 'Recent')} ({completedTaskIds.length})
                                    </Typography>
                                </Box>
                                <List disablePadding>
                                    {completedTaskIds.slice(0, 10).map(taskId => renderTaskItem(taskId))}
                                </List>
                            </>
                        )}
                    </Box>
                </Box>
            </Popover>
        </>
    );
};

export default BackgroundTasksPopover;
