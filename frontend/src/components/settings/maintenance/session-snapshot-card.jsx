/**
 * @license
 * Copyright (c) 2025 Efstratios Goudelis
 */

import React, { useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import { Typography, Divider, Chip, TextField, Stack, Paper } from '@mui/material';
import Grid from '@mui/material/Grid';
import { useSocket } from '../../common/socket.jsx';
import { setRuntimeSnapshot } from '../sessions-slice.jsx';

const KeyValue = ({ label, value }) => (
    <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
        <Typography variant="body2" color="text.secondary" sx={{ minWidth: 140 }}>{label}</Typography>
        <Typography variant="body2" sx={{ fontFamily: 'monospace', wordBreak: 'break-word' }}>{value ?? '—'}</Typography>
    </Stack>
);

const SectionTitle = ({ children }) => (
    <Typography variant="subtitle2" color="text.secondary" gutterBottom sx={{ mt: 1 }}>{children}</Typography>
);

const ConsumerBadges = ({ map }) => {
    if (!map || typeof map !== 'object') return null;
    const entries = Object.entries(map);
    if (!entries.length) return <Typography variant="body2" color="text.secondary">None</Typography>;
    return (
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
            {entries.map(([k, v]) => (
                <Chip key={k} size="small" label={`${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`} />
            ))}
        </Stack>
    );
};

const SessionSnapshotCard = () => {
    const dispatch = useDispatch();
    const { socket } = useSocket();
    const [sdrFilter, setSdrFilter] = useState('');
    const [sessionFilter, setSessionFilter] = useState('');

    const runtime = useSelector((state) => state.sessions.runtimeSnapshot);

    // Subscribe to backend push: 'session-runtime-snapshot'
    useEffect(() => {
        if (!socket) return;
        const handler = (snapshot) => {
            dispatch(setRuntimeSnapshot(snapshot));
        };
        socket.on('session-runtime-snapshot', handler);
        return () => {
            socket.off('session-runtime-snapshot', handler);
        };
    }, [socket, dispatch]);

    const rawSnapshot = runtime.data || { sessions: {}, sdrs: {} };

    // Apply client-side filters for display
    const snapshot = {
        sessions: Object.fromEntries(
            Object.entries(rawSnapshot.sessions || {}).filter(([sid, info]) => {
                const sdrMatch = sdrFilter?.trim() ? info?.sdr_id === sdrFilter.trim() : true;
                const sidMatch = sessionFilter?.trim() ? sid === sessionFilter.trim() : true;
                return sdrMatch && sidMatch;
            })
        ),
        sdrs: Object.fromEntries(
            Object.entries(rawSnapshot.sdrs || {}).filter(([sdrId, entry]) => {
                const sdrMatch = sdrFilter?.trim() ? sdrId === sdrFilter.trim() : true;
                if (!sdrMatch) return false;
                if (sessionFilter?.trim()) {
                    const sid = sessionFilter.trim();
                    const clients = new Set(entry?.clients || []);
                    const hasInClients = clients.has(sid);
                    const hasInDemods = !!(entry?.demodulators && entry.demodulators[sid]);
                    const hasInRecorders = !!(entry?.recorders && entry.recorders[sid]);
                    const hasInDecoders = !!(entry?.decoders && entry.decoders[sid]);
                    return hasInClients || hasInDemods || hasInRecorders || hasInDecoders;
                }
                return true;
            })
        ),
    };

    return (
        <>
            <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
                <Typography variant="h6">Active Sessions & Runtime Snapshot</Typography>
                <Stack direction="row" spacing={1}>
                    <TextField size="small" label="Filter by SDR ID" value={sdrFilter} onChange={(e) => setSdrFilter(e.target.value)} />
                    <TextField size="small" label="Filter by Session ID" value={sessionFilter} onChange={(e) => setSessionFilter(e.target.value)} />
                </Stack>
            </Stack>
            <Divider sx={{ mb: 2 }} />

            {runtime.error && (
                <Typography variant="body2" color="error" sx={{ mb: 2 }}>
                    {String(runtime.error)}
                </Typography>
            )}

            <Grid container spacing={2} columns={16}>
                <Grid size={8}>
                    <SectionTitle>Sessions</SectionTitle>
                    <Divider sx={{ mb: 1 }} />
                    {Object.keys(snapshot.sessions || {}).length === 0 ? (
                        <Typography variant="body2" color="text.secondary">No active sessions</Typography>
                    ) : (
                        Object.entries(snapshot.sessions).map(([sid, info]) => (
                            <Paper key={sid} variant="outlined" sx={{ p: 1, mb: 1 }}>
                                <Typography variant="subtitle2" sx={{ fontFamily: 'monospace' }}>{sid}</Typography>
                                <KeyValue label="SDR" value={info?.sdr_id} />
                                <KeyValue label="Rig" value={info?.rig_id} />
                                <KeyValue label="VFO" value={info?.vfo ?? 'none'} />
                                <KeyValue label="IP" value={info?.ip} />
                            </Paper>
                        ))
                    )}
                </Grid>

                <Grid size={8}>
                    <SectionTitle>SDRs & Consumers</SectionTitle>
                    <Divider sx={{ mb: 1 }} />
                    {Object.keys(snapshot.sdrs || {}).length === 0 ? (
                        <Typography variant="body2" color="text.secondary">No SDR processes</Typography>
                    ) : (
                        Object.entries(snapshot.sdrs).map(([sdrId, s]) => (
                            <Paper key={sdrId} variant="outlined" sx={{ p: 1, mb: 1 }}>
                                <Stack direction="row" spacing={1} alignItems="center" sx={{ mb: 1 }}>
                                    <Typography variant="subtitle2" sx={{ fontFamily: 'monospace' }}>{sdrId}</Typography>
                                    <Chip size="small" color={s?.alive ? 'success' : 'default'} label={s?.alive ? 'alive' : 'stopped'} />
                                </Stack>
                                <SectionTitle>Clients</SectionTitle>
                                <ConsumerBadges map={(s && s.clients) ? Object.fromEntries((s.clients || []).map((c, i) => [String(i + 1), c])) : {}} />
                                <SectionTitle>Demodulators</SectionTitle>
                                <ConsumerBadges map={s?.demodulators} />
                                <SectionTitle>Recorders</SectionTitle>
                                <ConsumerBadges map={s?.recorders} />
                                <SectionTitle>Decoders</SectionTitle>
                                <ConsumerBadges map={s?.decoders} />
                            </Paper>
                        ))
                    )}
                </Grid>
            </Grid>

            <Divider sx={{ my: 2 }} />
            <Stack direction="row" spacing={2}>
                <KeyValue label="Last Updated" value={runtime.lastUpdated ? new Date(runtime.lastUpdated).toLocaleTimeString() : '—'} />
                <KeyValue label="Socket Connected" value={socket?.connected ? 'yes' : 'no'} />
                <KeyValue label="Update Mode" value="auto (3s)" />
            </Stack>
        </>
    );
};

export default SessionSnapshotCard;
