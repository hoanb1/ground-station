import logging.config
import logging
import yaml

def get_logger_config(args):
    """
    Loads a logging configuration.

    This function retrieves the logging configuration in YAML format
    from the file path provided in the arguments, converts it to a Python
    dictionary, and returns it. The configuration is useful for setting up
    logging behavior in an application.

    :param args: Parsed arguments containing the file path to the logging configuration.
    :type args: argparse.Namespace
    :return: Python dictionary with logging configuration.
    :rtype: dict
    :raises FileNotFoundError: If the specified logging configuration file cannot be found.
    :raises yaml.YAMLError: If the YAML configuration file cannot be parsed due to invalid syntax.
    """
    def yaml_to_json_config(filepath):
        with open(filepath, "r") as file:
            return yaml.safe_load(file)

    logging_config = yaml_to_json_config(args.log_config)

    return logging_config


def get_logger(args):
    """
    Obtains a logger instance configured according to the given logging configuration.

    This function reads the logging configuration from a YAML file specified in the provided
    arguments, converts it to a JSON-compatible dictionary, and then applies it to configure
    the Python logging module. It retrieves a logger instance named "ground-station" and logs
    an informational message containing the provided arguments.

    :param args: The command-line arguments containing the path to the logging
                 configuration file (YAML format).
    :type args: argparse.Namespace
    :return: A logger instance named "ground-station".
    :rtype: logging.Logger
    """
    logging_config = get_logger_config(args)
    logging.config.dictConfig(logging_config)
    logger = logging.getLogger("ground-station")

    return logger