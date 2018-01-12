import json


def get_indent(line):
    """ Count tabs at beginning of line. """
    return len(line) - len(line.lstrip())


def last_obj(obj_stack):
    return obj_stack[-1]


def get_children(obj):
    if 'children' not in obj:
        obj['children'] = []
    return obj['children']


def get_short_id(obj_stack):
    full_path_list = [obj['name'] for obj in obj_stack if obj.get('name') and not obj.get('display_only', False)]
    return '/' + '/'.join(full_path_list)


def parse_otl_file(otl_filename):
    root = {'children': []}
    # current_root = root
    obj_stack = [root]
    current_indent = -1
    with open(otl_filename) as f:
        for line in f.readlines():

            # Skip empty line.
            if not line.strip():
                continue

            display_only = '[display_only]' in line
            if '[display_only]' in line:
                line = line.replace('[display_only]', '')

            # Make object for line.
            line_indent = get_indent(line)
            new_obj = {'name': line.strip()}
            if display_only:
                new_obj['display_only'] = display_only
            if current_indent == -1:
                # Special case of beginning.
                get_children(last_obj(obj_stack)).append(new_obj)
                # Don't pop root from stack.
            elif line_indent == current_indent:
                # Same level.
                obj_stack.pop()  # we only want one per level in stack

                parent = last_obj(obj_stack)
                get_children(parent).append(new_obj)
            elif line_indent > current_indent:
                # Add child and go to it.
                parent = last_obj(obj_stack)
                get_children(parent).append(new_obj)
            elif line_indent < current_indent:
                # Parent: remove last items on stack.
                for _ in range(line_indent, current_indent + 1):
                    obj_stack.pop()
                parent = last_obj(obj_stack)
                get_children(parent).append(new_obj)
            else:
                raise Exception('Condition cannot happen')

            # noinspection PyTypeChecker
            obj_stack.append(new_obj)
            if not display_only:
                new_obj['id'] = get_short_id(obj_stack)
            current_indent = line_indent
    return root


def convert_otl_to_ts(otl_filename, ts_filename):
    """
    Read .otl file and save .ts file.
    """

    js = parse_otl_file(otl_filename)

    # Save json.
    out = json.dumps(js, sort_keys=True, indent=2)
    # noinspection Restricted_Python_calls
    with open(ts_filename, 'w') as f:
        f.write('// *** DO NOT EDIT DIRECTLY ***\n')
        f.write('// This is generated automatically by skilltree_gen.py\n')
        f.write('export const skilltree = \n')
        f.write(out)
        f.write(';\n')


if __name__ == '__main__':
    convert_otl_to_ts('skilltree.otl', '../client/src/app/common/skilltree.ts')
