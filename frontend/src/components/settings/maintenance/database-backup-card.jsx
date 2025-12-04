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

import React, { useState, useEffect } from 'react';
import {
    Card,
    CardContent,
    Typography,
    Button,
    Table,
    TableBody,
    TableCell,
    TableContainer,
    TableHead,
    TableRow,
    Paper,
    Box,
    CircularProgress,
    Dialog,
    DialogTitle,
    DialogContent,
    DialogActions,
    FormControlLabel,
    Checkbox,
    Alert
} from '@mui/material';
import { Download, Upload, Backup } from '@mui/icons-material';
import { useSocket } from '../../common/socket.jsx';
import { toast } from '../../../utils/toast-with-timestamp.jsx';

const DatabaseBackupCard = () => {
    const { socket } = useSocket();
    const [tables, setTables] = useState([]);
    const [loading, setLoading] = useState(false);
    const [restoreDialog, setRestoreDialog] = useState({ open: false, table: null });
    const [deleteBeforeRestore, setDeleteBeforeRestore] = useState(true);
    const [selectedFile, setSelectedFile] = useState(null);

    useEffect(() => {
        if (socket) {
            loadTables();
        }
    }, [socket]);

    const loadTables = async () => {
        if (!socket) return;

        setLoading(true);
        try {
            const response = await socket.emitWithAck('database_backup', {
                action: 'list_tables'
            });

            if (response.success) {
                setTables(response.tables);
            } else {
                toast.error(`Failed to load tables: ${response.error}`);
            }
        } catch (error) {
            toast.error(`Error loading tables: ${error.message}`);
        } finally {
            setLoading(false);
        }
    };

    const handleBackupTable = async (tableName) => {
        if (!socket) return;

        try {
            const response = await socket.emitWithAck('database_backup', {
                action: 'backup_table',
                table: tableName
            });

            if (response.success) {
                // Create a blob and download it
                const blob = new Blob([response.sql], { type: 'text/plain' });
                const url = window.URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = `${tableName}_backup_${new Date().toISOString().split('T')[0]}.sql`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                window.URL.revokeObjectURL(url);

                toast.success(`Table ${tableName} backed up successfully`);
            } else {
                toast.error(`Failed to backup table: ${response.error}`);
            }
        } catch (error) {
            toast.error(`Error backing up table: ${error.message}`);
        }
    };

    const handleRestoreTable = (tableName) => {
        setRestoreDialog({ open: true, table: tableName });
        setSelectedFile(null);
        setDeleteBeforeRestore(true);
    };

    const handleFileSelect = (event) => {
        const file = event.target.files[0];
        if (file) {
            setSelectedFile(file);
        }
    };

    const handleRestoreConfirm = async () => {
        if (!socket || !selectedFile || !restoreDialog.table) return;

        try {
            const sqlContent = await selectedFile.text();

            const response = await socket.emitWithAck('database_backup', {
                action: 'restore_table',
                table: restoreDialog.table,
                sql: sqlContent,
                delete_first: deleteBeforeRestore
            });

            if (response.success) {
                toast.success(`Table ${restoreDialog.table} restored successfully (${response.rows_inserted} rows inserted)`);
                setRestoreDialog({ open: false, table: null });
                setSelectedFile(null);
            } else {
                toast.error(`Failed to restore table: ${response.error}`);
            }
        } catch (error) {
            toast.error(`Error restoring table: ${error.message}`);
        }
    };

    const handleFullBackup = async () => {
        if (!socket) return;

        try {
            const response = await socket.emitWithAck('database_backup', {
                action: 'full_backup'
            });

            if (response.success) {
                // Create a blob and download it
                const blob = new Blob([response.sql], { type: 'text/plain' });
                const url = window.URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = `full_database_backup_${new Date().toISOString().split('T')[0]}.sql`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                window.URL.revokeObjectURL(url);

                toast.success('Full database backup completed successfully');
            } else {
                toast.error(`Failed to backup database: ${response.error}`);
            }
        } catch (error) {
            toast.error(`Error backing up database: ${error.message}`);
        }
    };

    return (
        <>
            <Card>
                <CardContent>
                    <Typography variant="h6" gutterBottom>
                        Database Backup & Restore
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                        Backup and restore individual tables or the entire database
                    </Typography>

                    <Box sx={{ mb: 2 }}>
                        <Button
                            variant="contained"
                            color="primary"
                            startIcon={<Backup />}
                            onClick={handleFullBackup}
                            disabled={loading}
                        >
                            Full Database Backup (Schema + Data)
                        </Button>
                    </Box>

                    <Alert severity="info" sx={{ mb: 2 }}>
                        Backup files contain only INSERT statements. Schema is included in full backup only.
                    </Alert>

                    {loading ? (
                        <Box sx={{ display: 'flex', justifyContent: 'center', p: 3 }}>
                            <CircularProgress />
                        </Box>
                    ) : (
                        <TableContainer component={Paper} variant="outlined">
                            <Table size="small">
                                <TableHead>
                                    <TableRow>
                                        <TableCell>Table Name</TableCell>
                                        <TableCell align="center">Row Count</TableCell>
                                        <TableCell align="right">Actions</TableCell>
                                    </TableRow>
                                </TableHead>
                                <TableBody>
                                    {tables.map((table) => (
                                        <TableRow key={table.name}>
                                            <TableCell component="th" scope="row">
                                                <Typography variant="body2" sx={{ fontFamily: 'monospace' }}>
                                                    {table.name}
                                                </Typography>
                                            </TableCell>
                                            <TableCell align="center">
                                                <Typography variant="body2">
                                                    {table.row_count}
                                                </Typography>
                                            </TableCell>
                                            <TableCell align="right">
                                                <Button
                                                    size="small"
                                                    startIcon={<Download />}
                                                    onClick={() => handleBackupTable(table.name)}
                                                    sx={{ mr: 1 }}
                                                >
                                                    Backup
                                                </Button>
                                                <Button
                                                    size="small"
                                                    startIcon={<Upload />}
                                                    onClick={() => handleRestoreTable(table.name)}
                                                    color="warning"
                                                >
                                                    Restore
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </TableContainer>
                    )}
                </CardContent>
            </Card>

            <Dialog open={restoreDialog.open} onClose={() => setRestoreDialog({ open: false, table: null })}>
                <DialogTitle>Restore Table: {restoreDialog.table}</DialogTitle>
                <DialogContent>
                    <Box sx={{ minWidth: 400 }}>
                        <Alert severity="warning" sx={{ mb: 2 }}>
                            This operation will modify the database. Make sure you have a backup!
                        </Alert>

                        <FormControlLabel
                            control={
                                <Checkbox
                                    checked={deleteBeforeRestore}
                                    onChange={(e) => setDeleteBeforeRestore(e.target.checked)}
                                />
                            }
                            label="Delete all rows before restoring"
                        />

                        <Box sx={{ mt: 2 }}>
                            <Button
                                variant="outlined"
                                component="label"
                                fullWidth
                            >
                                Select SQL File
                                <input
                                    type="file"
                                    hidden
                                    accept=".sql"
                                    onChange={handleFileSelect}
                                />
                            </Button>
                            {selectedFile && (
                                <Typography variant="body2" sx={{ mt: 1 }}>
                                    Selected: {selectedFile.name}
                                </Typography>
                            )}
                        </Box>
                    </Box>
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setRestoreDialog({ open: false, table: null })}>
                        Cancel
                    </Button>
                    <Button
                        onClick={handleRestoreConfirm}
                        variant="contained"
                        color="warning"
                        disabled={!selectedFile}
                    >
                        Restore
                    </Button>
                </DialogActions>
            </Dialog>
        </>
    );
};

export default DatabaseBackupCard;
