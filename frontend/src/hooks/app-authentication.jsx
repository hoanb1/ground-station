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

import { useMemo } from 'react';
import toast from 'react-hot-toast';
import { useAuth } from '../components/common/auth.jsx';

/**
 * Custom hook to manage application authentication
 * @returns {Object} Authentication object for ReactRouterAppProvider
 */
export const appAuthentication = () => {
    const { logOut } = useAuth();

    return useMemo(() => {
        return {
            signIn: () => {
                toast('user clicked on the sign in button');
            },
            signOut: () => {
                logOut();
                toast.success('You have been logged out');
            },
        };
    }, [logOut]);
};
