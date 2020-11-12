$(function () {

    $('input[type="radio"][name="type"]').change(function () {
        try {
            var obj = {};
            switch ($(this).val()) {
                case 'autocomplete':
                    obj = {
                        as: ''
                        , cascade: false
                        , model: ''
                        , attribute: ''
                        , query: ''
                        , where: ''
                    };
                    break;
                case 'decimal':
                    obj = {
                        precision: 2
                    };
                    break;
                case 'file':
                    obj = {
                        acceptedfiles: ''
                        , maxfiles: ''
                        , sizeTotal: ''
                        , forcejpg: false
                        , maxwh: ''
                        , public: false
                    };
                    break;
                case 'radio':
                    obj = {
                        options: []
                        , renderAsSelect: false
                    };
                    break;
                case 'textarea':
                    obj = {
                        rows: 3
                        , placeholder: ''
                        , wysiwyg: false
                    };
                    break;
                case 'virtual':
                    obj = {
                        subquery: ''
                        , type: ''
                        , model: ''
                        , attribute: ''
                        , field: ''
                        , precision: ''
                    };
                    break;
            };
            var html = '{\n';
            var first = true;
            for (var k in obj) {
                html += (first ? '' : ', ') + '"' + k + '": ' + JSON.stringify(obj[k]) + '\n ';
                first = false;
            }
            html += '}';
            $('textarea[name="typeadd"]').html(html);
        } catch (error) {
            application.notify.error(error);
        }
    });

});