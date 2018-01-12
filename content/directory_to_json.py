import json
import os
import sys


def path_to_flat_dict(lst, orig_path, path):
    if os.path.isdir(path):
        for x in os.listdir(path):
            if not x.startswith('.'):
                path_to_flat_dict(lst, orig_path, os.path.join(path, x))
    else:
        lst.append({
            'name': path[len(orig_path) + 1:],  # os.path.basename(path),
            'contents': open(path, 'r').read()
        })


def load_dir_save_json(dir_name):
    """
    Read given dir_name, save json file and return it.
    :param dir_name:
    :return:
    """
    json_filename = dir_name + '.json'
    js = []
    path_to_flat_dict(js, dir_name, dir_name)

    # Save json.
    out = json.dumps(js, sort_keys=True, indent=4)
    # noinspection Restricted_Python_calls
    open(json_filename, 'w').write(out)

    # Return it.
    return out

if __name__ == '__main__':
    load_dir_save_json(sys.argv[1])

