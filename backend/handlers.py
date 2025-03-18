import crud


def data_request_routing(session, cmd, data, logger):
    """
    Routes data requests based on the command provided, fetching respective
    data from the database. Depending on the `cmd` parameter, it retrieves
    specific information by invoking respective CRUD operations. Logs
    information if the command is unrecognized.

    :param session: Database session factory for creating session instances.
    :type session: Callable
    :param cmd: Command string specifying the action to perform. It determines
                the target data to fetch.
    :type cmd: str
    :param data: Additional data that might need to be considered during
                 processing. Not utilized in the current implementation.
    :type data: Any
    :param logger: Logging object used to log informational messages.
    :type logger: logging.Logger
    :return: Dictionary containing 'success' status and fetched 'data'. The
             structure of 'data' depends on the command executed.
    :rtype: dict
    """

    dbsession = session()
    reply = {'success': None, 'data': None}

    if cmd == "get-tle-sources":
        # get rows
        tle_sources = crud.fetch_satellite_tle_source(dbsession)
        reply = {'success': tle_sources['success'], 'data': tle_sources.get('data', [])}

    elif cmd == "get-satellites":
        # get rows
        tle_sources = crud.fetch_satellites(dbsession)
        reply = {'success': tle_sources['success'], 'data': tle_sources.get('data', [])}

    elif cmd == "get-satellite-groups":
        satellite_groups = crud.fetch_satellite_group(dbsession)
        reply = {'success': satellite_groups['success'], 'data': satellite_groups.get('data', [])}

    elif cmd == "fetch-satellite-data":
        pass

    else:
        logger.info(f'Unknown command: {cmd}')

    dbsession.close()

    return reply

def data_submission_routing(session, cmd, data, logger):
    """
    Routes data submission commands to the appropriate CRUD operations and
    returns the response. The function supports creating, deleting, and
    editing TLE (Two-Line Element) sources. It processes the input data,
    executes the corresponding command, and fetches the latest data from
    the database to include in the response.

    :param session: Database session factory used to interact with the database.
    :type session: callable
    :param cmd: Command string indicating the operation to perform. Supported
                commands are "submit-tle-sources", "delete-tle-sources",
                and "edit-tle-source".
    :type cmd: str
    :param data: Data necessary for executing the specified command. For creation,
                 it includes details of the new TLE source. For deletion, it
                 specifies the identifiers of sources to delete. For editing, it
                 includes the ID of the source to edit and its updated details.
    :type data: dict
    :param logger: Logger instance used to log information about the operation.
    :type logger: logging.Logger
    :return: A dictionary containing the operation status and any updated
             TLE source data.
    :rtype: dict
    """

    reply = {'success': None, 'data': None}
    dbsession = session()

    if cmd == "submit-tle-sources":
        logger.info(f'Adding TLE source: {data}')
        crud.add_satellite_tle_source(dbsession, data)

        tle_sources = crud.fetch_satellite_tle_source(dbsession)
        reply = {'success': tle_sources['success'], 'data': tle_sources.get('data', [])}

    elif cmd == "delete-tle-sources":
        logger.info(f'Deleting TLE source: {data}')
        crud.delete_satellite_tle_sources(dbsession, data)

        tle_sources = crud.fetch_satellite_tle_source(dbsession)
        reply = {'success': tle_sources['success'], 'data': tle_sources.get('data', [])}

    elif cmd == "edit-tle-source":
        logger.info(f'Editing TLE source: {data}')
        crud.edit_satellite_tle_source(dbsession, data['id'], data)

        # get rows
        tle_sources = crud.fetch_satellite_tle_source(dbsession)
        reply = {'success': tle_sources['success'], 'data': tle_sources.get('data', [])}

    elif cmd == "submit-satellite-group":
        logger.info(f'Adding satellite group: {data}')
        crud.add_satellite_group(dbsession, data)

        satellite_groups = crud.fetch_satellite_group(dbsession)
        reply = {'success': satellite_groups['success'], 'data': satellite_groups.get('data', [])}

    elif cmd == "delete-satellite-group":
        logger.info(f'Deleting satellite groups: {data}')
        crud.delete_satellite_group(dbsession, data)

        satellite_groups = crud.fetch_satellite_group(dbsession)
        reply = {'success': satellite_groups['success'], 'data': satellite_groups.get('data', [])}

    elif cmd == "edit-satellite-group":
        logger.info(f'Editing satellite group: {data}')
        crud.edit_satellite_group(dbsession, data['id'], data)

        # get rows
        satellite_groups = crud.fetch_satellite_group(dbsession)
        reply = {'success': satellite_groups['success'], 'data': satellite_groups.get('data', [])}

    else:
        logger.info(f'Unknown command: {cmd}')

    dbsession.close()

    return reply


def auth_request_routing(session, cmd, data, logger):
    """
    Routes authentication requests to the appropriate handler based on the provided
    command and data, while managing the database session and logging activities.

    :param session: A callable used to create a new database session.
    :param cmd: A string representing the specific command or action to be
        executed.
    :param data: A dictionary containing data required for processing the
        authentication request.
    :param logger: An object or module used for logging activity within the
        function.
    :return: A dictionary with keys 'success' and 'data' indicating the result of
        the operation.
    """
    reply = {'success': None, 'data': None}
    dbsession = session()
    dbsession.close()
    return reply