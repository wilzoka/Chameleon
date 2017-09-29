var tables = [];
var application = {
    index: function () {
        // Menu, Title, Username
        $('ul.sidebar-menu').append(localStorage.getItem('menu'));

        if ($('a[href="' + window.location.pathname + '"]')[0]) {
            $('section.content-header h1').text($('a[href="' + window.location.pathname + '"]').text());
        }

        var pathname = window.location.pathname;
        pathname = pathname.split('/');
        path = pathname[0] + '/' + pathname[1] + '/' + pathname[2];
        var $menuitem = $('a[href="' + path + '"]');
        if ($menuitem[0]) {
            $menuitem.parent().addClass('active');
            $menuitem.parents('li.treeview').addClass('menu-open');
            $menuitem.parents('ul.treeview-menu').css('display', 'block');
        } else {
            if (pathname.length == 4) {
                $menuitem = $('a[href="' + path + '/' + pathname[3] + '"]');
                $menuitem.parent().addClass('active');
                $menuitem.parents('li.treeview').addClass('menu-open');
                $menuitem.parents('ul.treeview-menu').css('display', 'block');
            }
        }


        $('#appusername').text(localStorage.getItem('username'));

        // Events
        $(window).on('resize', function () {
            if ($(window).width() < 768) {
                $('body').removeClass('sidebar-collapse');
                Cookies.remove('sidebar-collapse');
            }
        });
        $(window).bind('pageshow', function (event) {
            if (event.originalEvent.persisted) {
                window.location.reload();
            }
        });
        $(document).on('submit', 'form.xhr', function (e) {
            e.preventDefault();
            var $this = $(this);
            $.ajax({
                url: $this[0].action
                , type: 'POST'
                , dataType: 'json'
                , data: $this.serialize()
                , beforeSend: function () {
                    $this.find('button:submit').prop('disabled', true);
                    $this.find('div.has-error').removeClass('has-error');
                }
                , success: function (response) {
                    if ($this.attr('data-modal') == 'true') {
                        $this.find('div.modal').modal('hide');
                    }
                    application.handlers.responseSuccess(response);
                }
                , error: function (response) {
                    application.handlers.responseError(response);
                }
                , complete: function () {
                    $this.find('button:submit').prop('disabled', false);
                }
            });
        });
        $('a.sidebar-toggle').click(function () {
            if ($('body').hasClass('sidebar-collapse')) {
                Cookies.remove('sidebar-collapse');
            } else {
                if ($(window).width() >= 768) {
                    Cookies.set('sidebar-collapse', true);
                }
            }
        });
        $(document).on('click', 'a.btnevent', function () {
            var table = $(this).attr('data-table');
            var idevent = $(this).attr('data-event');
            var ids = $('#' + table).attr('data-selected');

            $.ajax({
                url: '/event/' + idevent
                , type: 'GET'
                , dataType: 'json'
                , data: { ids: ids }
                , success: function (response) {
                    application.handlers.responseSuccess(response);
                }
                , error: function (response) {
                    application.handlers.responseError(response);
                }
            });

        });
        $('button.btnreturn').click(function () {
            window.history.back();
        });
        //Filter
        $(document).on('click', 'button.btnfilter', function () {
            var $this = $(this);
            var table = $this.attr('data-table');
            $('#' + table + 'filter').modal('show');
        });
        $(document).on('click', 'button.btngofilter', function (e) {
            var $modal = $(this).closest('div.modal');
            var table = $modal.attr('data-table');

            application.tables.saveFilter(table);
            application.tables.reload(table);
            tables[table].page(0).draw(false);

            $modal.modal('hide');
        });
        $(document).on('click', 'button.btncleanfilter', function () {
            var $modal = $(this).closest('div.modal');
            application.components.clearInside($modal);
        });
        $(document).on('keydown', '.modal[data-role="filter"]', function (e) {
            if (e.which == 13) {
                $(this).find('button.btngofilter').trigger('click');
            }
        });
    }
    , components: {
        renderAll: function () {
            application.components.date($('input[data-type="date"]'));
            application.components.datetime($('input[data-type="datetime"]'));
            application.components.time($('input[data-type="time"]'));
            application.components.integer($('input[data-type="integer"]'));
            application.components.decimal($('input[data-type="decimal"]'));
            application.components.autocomplete($('select[data-type="autocomplete"]'));
            application.components.table($('table.dataTable'));
        }
        , renderInside: function ($el) {
            application.components.date($el.find('input[data-type="date"]'));
            application.components.datetime($el.find('input[data-type="datetime"]'));
            application.components.time($el.find('input[data-type="time"]'));
            application.components.integer($el.find('input[data-type="integer"]'));
            application.components.decimal($el.find('input[data-type="decimal"]'));
            application.components.autocomplete($el.find('select[data-type="autocomplete"]'));
            application.components.table($el.find('table.dataTable'));
        }
        , clearInside: function ($el) {
            $el.find('input[data-type="text"]').val('');
            $el.find('input[data-type="textarea"]').val('');
            $el.find('input[data-type="date"]').val('');
            $el.find('input[data-type="datetime"]').val('');
            $el.find('input[data-type="time"]').val('');
            $el.find('input[data-type="integer"]').val('');
            $el.find('input[data-type="decimal"]').val('');
            $el.find('select[data-type="autocomplete"]').val(null).trigger('change');

            $el.find('input[type="radio"]').filter('[value=""]').prop('checked', true);
        }
        , date: function ($obj) {
            $obj.datetimepicker({
                format: 'DD/MM/YYYY'
                , showClear: true
                , showTodayButton: true
                , useCurrent: false
                , locale: 'pt-br'
            }).on('dp.change', function () {
                // $(this).blur();
            }).mask('00/00/0000');
        }
        , datetime: function ($obj) {
            $obj.datetimepicker({
                format: 'DD/MM/YYYY HH:mm'
                , showClear: true
                , showTodayButton: true
                , useCurrent: false
                , locale: 'pt-br'
            }).on('dp.change', function () {
                // $(this).blur();
            }).mask('00/00/0000 00:00');
        }
        , time: function ($obj) {
            $obj.mask('00:00');
        }
        , integer: function ($obj) {
            $obj.each(function () {
                $(this).maskMoney({ allowEmpty: true, allowZero: true, allowNegative: true, thousands: '', decimal: '', precision: 0 });
            });
        }
        , decimal: function ($obj) {
            $obj.each(function () {
                var precision = $(this).attr('data-precision');
                $(this).maskMoney({ allowEmpty: true, allowZero: true, allowNegative: true, thousands: '.', decimal: ',', precision: precision });
            });
        }
        , autocomplete: function ($obj) {
            $obj.each(function () {
                var where = $(this).attr('data-where');
                if (where && where.indexOf('$parent') >= 0) {
                    where = where.replace('$parent', application.functions.getUrlParameter('parent') || application.functions.getId());
                    $(this).attr('data-where', where);
                }
            });
            $obj.select2({
                ajax: {
                    url: '/autocomplete',
                    dataType: 'json',
                    delay: 500,
                    data: function (params) {
                        var model = $(this).attr('data-model');
                        var attribute = $(this).attr('data-attribute');
                        var where = $(this).attr('data-where');
                        return {
                            q: params.term
                            , page: params.page
                            , model: model
                            , attribute: attribute
                            , where: where
                        };
                    }
                    , processResults: function (response) {
                        return {
                            results: response.data
                        };
                    }
                }
                , placeholder: "Selecione"
                , allowClear: true
                , language: "pt-BR"
            }).on('select2:close', function (evt) {
                $(this).focus();
            });;
        }
        , table: function ($obj) {
            $obj.each(function () {
                var $this = $(this);
                $.ajax({
                    url: '/view/' + $this.attr('data-view') + '/config'
                    , type: 'GET'
                    , dataType: 'json'
                    , data: $this.serialize()
                    , success: function (response) {
                        application.tables.create(response);
                    }
                    , error: function (response) {
                        notifyError(response);
                    }
                });
            });
        }
    }
    , tables: {
        create: function (data) {

            var createButtons = function (sTableId) {
                var insertButton = '';
                if ($('#' + sTableId).attr('data-insertable') == 'true') {
                    insertButton = '<button id="' + sTableId + '_insert" type="button" class="btn btn-success" data-table="' + sTableId + '" title="Incluir"><i class="fa fa-plus"></i></button>';
                }

                var editButton = '';
                if ($('#' + sTableId).attr('data-editable') == 'true') {
                    editButton = '<button id="' + sTableId + '_edit" type="button" class="btn btn-warning" data-table="' + sTableId + '" title="Editar"><i class="fa fa-edit"></i></button>';
                } else {
                    editButton = '<button id="' + sTableId + '_edit" type="button" class="btn btn-info" data-table="' + sTableId + '" title="Editar"><i class="fa fa-search"></i></button>';
                }

                var deleteButton = '';
                if ($('#' + sTableId).attr('data-deletable') == 'true') {
                    deleteButton = '<button id="' + sTableId + '_delete" type="button" class="btn btn-danger" data-table="' + sTableId + '"  title="Excluir"><i class="fa fa-trash"></i></button>';
                }

                $('#' + sTableId).closest('div#' + sTableId + '_wrapper').after('<div class="btn-group">' + insertButton + editButton + deleteButton + '</div>');

                $('button#' + sTableId + '_insert').click(function () {
                    var tableid = $(this).attr('data-table');
                    var idview = $('#' + tableid).attr('data-view');
                    var subview = $('#' + tableid).attr('data-subview');
                    var add = '';
                    if (subview) {
                        add = '?parent=' + application.functions.getId()
                    }
                    window.location.href = '/view/' + idview + '/0' + add;
                });
                $('button#' + sTableId + '_edit').click(function () {
                    var tableid = $(this).attr('data-table');
                    var idview = $('#' + tableid).attr('data-view');
                    var subview = $('#' + tableid).attr('data-subview');
                    var add = '';
                    if (subview) {
                        add = '?parent=' + application.functions.getId()
                    }
                    var selected = $('#' + tableid).attr('data-selected');
                    if (selected) {
                        selected = selected.split(',');
                        window.location.href = '/view/' + idview + '/' + selected[selected.length - 1] + add;
                    } else {
                        application.notify.info('Selecione um registro para Editar');
                    }
                });
                $('button#' + sTableId + '_delete').click(function () {

                    var tableid = $(this).attr('data-table');
                    var selected = $('#' + tableid).attr('data-selected');
                    var idview = $('#' + tableid).attr('data-view');

                    if (selected) {

                        selectedsplited = selected.split(',');

                        var msg = '';
                        if (selectedsplited.length > 1) {
                            msg = 'Os registros selecionados serão Excluídos. Continuar?';
                        } else {
                            msg = 'O registro selecionado será Excluído. Continuar?';
                        }

                        application.functions.confirmMessage(msg, function () {

                            $.ajax({
                                url: '/view/' + idview + '/delete'
                                , type: 'POST'
                                , dataType: 'json'
                                , data: { ids: selected }
                                , success: function (response) {
                                    application.handlers.responseSuccess(response);
                                    application.tables.reload(tableid);
                                }
                                , error: function (response) {
                                    application.handlers.responseError(response);
                                }
                            });

                        });

                    } else {
                        application.notify.error('Selecione um registro para Excluir');
                    }
                });
            }

            // Renders
            for (var i = 0; i < data.columns.length; i++) {
                if (data.columns[i].render) {
                    data.columns[i].render = application.tables.renders[data.columns[i].render];
                }
            }

            // Events
            var html = '<div class="row"><div class="col-md-12">';
            if (data.events.length > 0) {
                html += '<div class="btn-group btn-group-events">'
                    + '<button type="button" class="btn btn-default dropdown-toggle" data-toggle="dropdown">'
                    + '<i class="fa fa-caret-down"></i>'
                    + '</button>'
                    + '<ul class="dropdown-menu">'
                for (var i = 0; i < data.events.length; i++) {
                    html += '<li><a class="btnevent" href="javascript:void(0)" data-table="tableview' + data.name + '" data-event="' + data.events[i].id + '"><i class="' + data.events[i].icon + '"></i> ' + data.events[i].description + '</a></li>';
                }
                html += '</ul>'
                    + '</div>';
            }

            // Footer
            if (data.footer) {
                $('#tableview' + data.name).append(data.footer);
            }

            // Filter Button
            html += '<div class="btn-group btn-group-filter">'
                + '<button type="button" class="btn btnfilter ' + (data.filter.count > 0 ? 'btn-primary' : 'btn-default') + '" data-table="tableview' + data.name + '">'
                + '<i class="fa fa-search fa-flip-horizontal"></i>'
                + '</button>'
                + '</div>'
                + '</div>'
                + '</div>';
            $(html).insertBefore('#tableview' + data.name);

            // Filter Modal
            $('body').append(application.modal.create({
                id: 'tableview' + data.name + 'filter'
                , title: 'Filtro'
                , body: data.filter.html
                , footer: '<button type="button" class="btn btncleanfilter btn-default" title="Limpar"><i class="fa fa-eraser"></i></button> <button type="button" class="btn btngofilter btn-primary" title="Filtrar"><i class="fa fa-search"></i></button>'
                , attr: [
                    { key: 'data-table', value: 'tableview' + data.name }
                    , { key: 'data-role', value: 'filter' }
                ]
            }));
            application.components.renderInside($('#tableview' + data.name + 'filter'));

            // Permissions
            $('#tableview' + data.name).attr('data-insertable', data.permissions.insertable);
            $('#tableview' + data.name).attr('data-editable', data.permissions.editable);
            $('#tableview' + data.name).attr('data-deletable', data.permissions.deletable);

            // Datatable
            tables['tableview' + data.name] = $('#tableview' + data.name).DataTable({
                dom: 'trip'
                , language: {
                    paginate: {
                        next: 'Próximo'
                        , previous: 'Anterior'
                    }
                    , sInfo: 'Exibindo _START_ a _END_ de _TOTAL_'
                    , sInfoEmpty: ''
                    , sInfoFiltered: '(filtrado de _MAX_ registros)'
                    , sLengthMenu: '_MENU_'
                    , sLoadingRecords: 'Carregando...'
                    , sProcessing: 'Processando...'
                    , sSearch: 'Pesquisar: '
                    , sZeroRecords: 'Nenhum registro correspondente foi encontrado'
                    , sEmptyTable: 'Vazio'
                }
                , drawCallback: function (settings) {
                    var selected = $(settings.nTable).attr('data-selected');
                    if (selected) {
                        selected = selected.split(',');
                        for (var i = 0; i < selected.length; i++) {
                            tables[settings.sInstance].row('tr#' + selected[i]).select();
                        }
                    }
                }
                , stateSave: true
                , columns: data.columns
                // , scrollX: true
                , select: {
                    style: 'multi'
                    , info: false
                }
                , processing: true
                , serverSide: true
                , ajax: function (data, callback, settings) {
                    $.ajax({
                        url: '/datatables'
                        , data: $.extend({}, data, {
                            id: application.functions.getId()
                            , idview: $(settings.nTable).attr('data-view')
                            , issubview: $(settings.nTable).attr('data-subview') || false
                        })
                        , success: function (response) {
                            callback(response);
                        }
                        , error: function (response) {
                            application.handlers.responseError(response);
                        }
                    });
                }
                , initComplete: function (settings) {
                    var $table = $(settings.nTable);
                    var subview = $table.attr('data-subview');
                    if (!subview) {
                        createButtons(settings.sTableId);
                    } else if (subview && application.functions.getId() > 0) {
                        createButtons(settings.sTableId);
                    }
                    application.tables.reloadFooter(settings.sTableId);
                }
            }).on('select', function (e, dt, type, indexes) {
                var $this = $(this);
                var rowData = tables[$this[0].id].rows(indexes).data().toArray()[0];
                var id = '' + rowData.id;
                var selected = $this.attr('data-selected');
                if (selected) {
                    selected = selected.split(',');
                    if ($.inArray(id, selected) === -1) {
                        selected.push(id);
                    }
                } else {
                    selected = [id];
                }
                $this.attr('data-selected', selected);
            }).on('deselect', function (e, dt, type, indexes) {
                var $this = $(this);
                var rowData = tables[$this[0].id].rows(indexes).data().toArray()[0];
                var id = '' + rowData.id;
                var selected = $this.attr('data-selected');
                if (selected) {
                    selected = selected.split(',');
                    var index = $.inArray(id, selected);
                    selected.splice(index, 1);
                }
                $this.attr('data-selected', selected);
            }).on('dblclick', 'tbody tr', function (e) {
                if (application.functions.isMobile()) {
                } else {
                    var $table = $(e.delegateTarget);
                    var tableid = $table[0].id;
                    var idview = $('#' + tableid).attr('data-view');
                    var subview = $('#' + tableid).attr('data-subview');
                    var add = '';
                    if (subview) {
                        add = '?parent=' + application.functions.getId()
                    }
                    window.location.href = '/view/' + idview + '/' + tables[tableid].row(this).data().id + add;
                }
            });
        }
        , deselectAll: function (idtable) {
            tables[idtable].rows().deselect();
            $('#' + idtable).attr('data-selected', '');
        }
        , reload: function (idtable) {
            application.tables.deselectAll(idtable);
            tables[idtable].ajax.reload(null, false);
            application.tables.reloadFooter(idtable);
        }
        , reloadAll: function () {
            for (var k in tables) {
                application.tables.reload(k);
            }
        }
        , reloadFooter: function (idtable) {
            $('#' + idtable).find('span.totalize').each(function () {
                var $this = $(this);
                $.ajax({
                    url: '/datatables/sum'
                    , type: 'GET'
                    , dataType: 'json'
                    , data: {
                        id: application.functions.getId()
                        , idview: $this.attr('data-view')
                        , idmodelattribute: $this.attr('data-attribute')
                        , issubview: $('#' + idtable).attr('data-subview') || false
                    }
                    , success: function (response) {
                        if (response.success) {
                            $this.html(response.data);
                        } else {
                            $this.html('NaN');
                        }
                    }
                    , error: function (response) {
                        application.handlers.responseError(response);
                    }
                });
            });
        }
        , renders: {
            boolean: function (value) {
                if (value) {
                    return '<i class="fa fa-check" style="color: green;"></i>';
                } else {
                    return '<i class="fa fa-times" style="color: red;"></i>';
                }
            }
            , booleancircle: function (value) {
                if (value) {
                    return '<i class="fa fa-circle" style="color: green;"></i>';
                } else {
                    return '<i class="fa fa-circle" style="color: red;"></i>';
                }
            }
            , icon: function (value) {
                if (value) {
                    return '<i class="' + value + '"></i>';
                } else {
                    return '';
                }
            }
            , colors: function (value) {
                if (value == 'Azul') {
                    return '<span class="label label-info">' + value + '</span>';
                } else if (value == 'Vermelho') {
                    return '<span class="label label-danger">' + value + '</span>';
                } else {
                    return value;
                }
            }
            , meucustomrender: function (value) {
                return '<span class="label label-success">' + value + '</span>';
            }
            , iconawesome: function (value) {
                if (value) {
                    return value + '<i class="fa fa-check"></i>'
                } else {
                    return '<i class="fa fa-check"></i>'
                }
            }
        }
        , saveFilter: function (idtable) {
            var $modal = $('div#' + idtable + 'filter');
            var cookie = [];
            var types = [
                'input[data-type="text"]'
                , 'input[data-type="date"]'
                , 'input[data-type="datetime"]'
                , 'input[data-type="time"]'
                , 'input[data-type="integer"]'
                , 'input[type="radio"]:checked'
                , 'input[data-type="decimal"]'
                , 'select[data-type="autocomplete"]'
            ];
            for (var i = 0; i < types.length; i++) {
                $modal.find(types[i]).each(function () {
                    var $this = $(this);
                    var val = $this.val();

                    if (typeof val == 'object') {
                        if (val.length > 0) {
                            var o = {};
                            var options = '';
                            var optionsarr = $this.select2('data');
                            for (var z = 0; z < optionsarr.length; z++) {
                                options += '<option value="' + optionsarr[z].id + '" selected>' + optionsarr[z].text + '</option>';
                            }
                            o[$this.attr('name')] = { val: val, options: options };
                            cookie.push(o);
                        }
                    } else {
                        if (val) {
                            var o = {};
                            o[$this.attr('name')] = val;
                            cookie.push(o);
                        }
                    }

                });
            }

            var $button = $('button.btnfilter[data-table="' + idtable + '"]');
            if (cookie.length > 0) {
                $button.removeClass('btn-default').addClass('btn-primary');
                Cookies.set($modal[0].id, JSON.stringify(cookie));
            } else {
                $button.removeClass('btn-primary').addClass('btn-default');
                Cookies.remove($modal[0].id);
            }

        }
    }
    , functions: {
        getId: function () {
            return $('#id').val() || '0';
        }
        , getUrlParameter: function (name) {
            url = window.location.href;
            name = name.replace(/[\[\]]/g, "\\$&");
            var regex = new RegExp("[?&]" + name + "(=([^&#]*)|&|#|$)"),
                results = regex.exec(url);
            if (!results) return null;
            if (!results[2]) return '';
            return decodeURIComponent(results[2].replace(/\+/g, " "));
        }
        , isMobile: function () {
            if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent)) {
                return true;
            }
            return false;
        }
        , confirmMessage: function (msg, functionSuccess) {
            $('.bootbox').modal('hide');
            bootbox.dialog({
                title: 'Atenção'
                , message: msg
                , buttons: {
                    cancel: {
                        label: 'Cancelar'
                        , className: 'btn-sm'
                    }
                    , confirm: {
                        label: 'Sim'
                        , className: 'btn-primary btn-sm'
                        , callback: function () {
                            functionSuccess();
                        }
                    }
                }
            });
        }
    }
    , handlers: {
        responseSuccess: function (response) {
            if (response.success) {

                if ('localstorage' in response) {
                    var ls = response.localstorage;
                    for (var i = 0; i < ls.length; i++) {
                        localStorage.setItem(ls[i].key, ls[i].value);
                    }
                }

                if ('redirect' in response) {
                    var redirect = response.redirect + window.location.search;
                    window.history.replaceState(null, null, redirect);
                    window.location.href = redirect;
                }

                if ('openurl' in response) {
                    window.open(response.openurl);
                }

                if ('msg' in response) {
                    application.notify.success(response.msg);
                }

                if ('modal' in response) {
                    if ('form' in response.modal && response.modal.form) {
                        $('body').append('<form class="xhr" autocomplete="off" data-modal="true" action="' + response.modal.action + '">' + application.modal.create(response.modal) + '</form>');
                    } else {
                        $('body').append(application.modal.create(response.modal));
                    }

                    application.components.renderInside($('#' + response.modal.id));
                    $('#' + response.modal.id).modal('show');
                    $('#' + response.modal.id).on('hidden.bs.modal', function () {
                        if ($(this).parent()[0].tagName == 'BODY') {
                            $(this).remove();
                        } else {
                            $(this).parent().remove();
                        }
                    });
                }

                if ('reloadtables' in response && response.reloadtables) {
                    application.tables.reloadAll();
                }

            } else {

                if ('invalidfields' in response) {
                    for (var i = 0; i < response.invalidfields.length; i++) {
                        $('input[name="' + response.invalidfields[i] + '"]').closest('div.form-group').addClass('has-error');
                        $('select[name="' + response.invalidfields[i] + '"]').closest('div.form-group').addClass('has-error');
                        $('textarea[name="' + response.invalidfields[i] + '"]').closest('div.form-group').addClass('has-error');
                    }
                }

                if ('msg' in response) {
                    application.notify.error(response.msg);
                }

            }
        }
        , responseError: function (response) {
            application.notify.error('Alguma coisa deu errado :(');
        }
    }
    , modal: {
        create: function (obj) {
            var attr = '';
            if ('attr' in obj) {
                for (var i = 0; i < obj.attr.length; i++) {
                    attr += ' ' + obj.attr[i].key + '="' + obj.attr[i].value + '"';
                }
            }

            var html = '<div class="modal fade" id="' + obj.id + '" ' + attr + '>';
            if ('fullscreen' in obj && obj.fullscreen) {
                html += '<div class="modal-dialog modal-fullscreen">';
            } else {
                html += '<div class="modal-dialog">';
            }

            html += '<div class="modal-content">';

            html += '<div class="modal-header">';
            html += '<button type="button" class="close" data-dismiss="modal" aria-label="Close">';
            html += '<span aria-hidden="true">×</span></button>';
            html += '<h4 class="modal-title">' + obj.title + '</h4>';
            html += '</div >';

            html += '<div class="modal-body">';
            html += '<div class="row">';
            html += obj.body;
            html += '</div>';
            html += '</div>';

            html += '<div class="modal-footer">';
            html += obj.footer;
            html += '</div>';

            html += '</div>';//modal-content
            html += '</div>';//modal-dialog

            return html;
        }
    }
    , notify: {
        getOptions: function () {
            return {
                element: 'body'
                , position: null
                , type: 'success'
                , allow_dismiss: true
                , newest_on_top: false
                , showProgressbar: false
                , placement: {
                    from: application.functions.isMobile() ? 'top' : 'bottom'
                    , align: 'right'
                }
                , offset: 20
                , spacing: 10
                , z_index: 1031
                , delay: 400
                , timer: 1000
                , animate: {
                    enter: 'animated fadeIn'
                    , exit: 'animated fadeOut'
                }
                , mouse_over: 'pause'
            };
        }
        , success: function (message) {
            $.notify({
                message: message
            }, $.extend(application.notify.getOptions(), { type: 'success' }));
        }
        , error: function (message) {
            $.notify({
                message: message
            }, $.extend(application.notify.getOptions(), { type: 'error' }));
        }
        , info: function (message) {
            $.notify({
                message: message
            }, $.extend(application.notify.getOptions(), { type: 'warning' }));
        }
    }
}