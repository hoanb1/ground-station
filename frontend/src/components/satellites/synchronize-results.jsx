
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

    // Calculate dynamic column sizing
    const columnCount = [hasNewItems, hasModifiedItems, hasRemovedItems].filter(Boolean).length;

    // Define responsive breakpoints based on column count
    const getResponsiveSize = () => {
        if (columnCount === 1) return { xs: 12, sm: 12, md: 12, lg: 10, xl: 8 };
        if (columnCount === 2) return { xs: 12, sm: 12, md: 6, lg: 6, xl: 6 };
        return { xs: 12, sm: 12, md: 4, lg: 4, xl: 4 };
    };

    const gridSize = getResponsiveSize();

    return (
        <Box sx={{ mt: 2 }}>

            <Grid2
                container
                spacing={{ xs: 1, sm: 1.5, md: 2 }}
                sx={{
                    width: '100%',
                    justifyContent: columnCount === 1 ? 'center' : 'flex-start'
                }}
            >
                {hasNewItems && (
                    <Grid2 size={gridSize}>
                        <AddedItemsTable
                            newSatellitesCount={newSatellitesCount}
                            newTransmittersCount={newTransmittersCount}
                            syncState={syncState}
                        />
                    </Grid2>
                )}

                {hasModifiedItems && (
                    <Grid2 size={gridSize}>
                        <ModifiedItemsTable
                            modifiedSatellitesCount={modifiedSatellitesCount}
                            modifiedTransmittersCount={modifiedTransmittersCount}
                            syncState={syncState}
                        />
                    </Grid2>
                )}

                {hasRemovedItems && (
                    <Grid2 size={gridSize}>
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