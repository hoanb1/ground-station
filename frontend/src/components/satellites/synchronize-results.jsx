
import React from 'react';
import { Box, Typography } from '@mui/material';
import Grid2 from '@mui/material/Grid2';
import AddedItemsTable from './synchronize-added.jsx';
import ModifiedItemsTable from './synchronize-modifed.jsx';
import RemovedItemsTable from './synchronize-removed.jsx';
import PropTypes from 'prop-types';

const SyncResultsTable = ({
                              hasNewItems,
                              hasModifiedItems,
                              hasRemovedItems,
                              newSatellitesCount,
                              newTransmittersCount,
                              modifiedSatellitesCount,
                              modifiedTransmittersCount,
                              removedSatellitesCount,
                              removedTransmittersCount,
                              syncState
                          }) => {
    if (!hasNewItems && !hasModifiedItems && !hasRemovedItems) return null;

    return (
        <Box sx={{ mt: 2 }}>
            <Grid2 container spacing={1} sx={{ width: '100%' }}>
                {hasNewItems && (
                    <Grid2 xs={12} md={4} size="grow">
                        <AddedItemsTable
                            newSatellitesCount={newSatellitesCount}
                            newTransmittersCount={newTransmittersCount}
                            syncState={syncState}
                        />
                    </Grid2>
                )}

                {hasModifiedItems && (
                    <Grid2 xs={12} md={4} size="grow">
                        <ModifiedItemsTable
                            modifiedSatellitesCount={modifiedSatellitesCount}
                            modifiedTransmittersCount={modifiedTransmittersCount}
                            syncState={syncState}
                        />
                    </Grid2>
                )}

                {hasRemovedItems && (
                    <Grid2 xs={12} md={4} size="grow">
                        <RemovedItemsTable
                            removedSatellitesCount={removedSatellitesCount}
                            removedTransmittersCount={removedTransmittersCount}
                            syncState={syncState}
                        />
                    </Grid2>
                )}
            </Grid2>
        </Box>
    );
};

SyncResultsTable.propTypes = {
    hasNewItems: PropTypes.bool.isRequired,
    hasModifiedItems: PropTypes.bool.isRequired,
    hasRemovedItems: PropTypes.bool.isRequired,
    newSatellitesCount: PropTypes.number.isRequired,
    newTransmittersCount: PropTypes.number.isRequired,
    modifiedSatellitesCount: PropTypes.number.isRequired,
    modifiedTransmittersCount: PropTypes.number.isRequired,
    removedSatellitesCount: PropTypes.number.isRequired,
    removedTransmittersCount: PropTypes.number.isRequired,
    syncState: PropTypes.object.isRequired,
};

export default SyncResultsTable;