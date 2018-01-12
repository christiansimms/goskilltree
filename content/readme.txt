2017-04-03
To update skilltree.ts:

    1. Update skilltree.otl
    2. ./skilltree_gen.sh
       Or to test:
       ./skilltree_gen.sh && cat ../client/src/app/common/skilltree.ts


2017-02-09
Templates are stored here, in directories.
To update template:
1. Edit contents in directory
2. ./gen_templates.sh
3. Copy/paste changed files content into tutor-content.ts
   NOTE: watch for bug in order of files for plnkr_vuejs_template_json
4. Go to existing tutorials and update their templates:
   cd ~/src/goskilltree/server/tutors

