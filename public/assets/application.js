// Defaults

// Datatable
$.extend(true, $.fn.dataTable.defaults, {
    language: {
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
});

// Dropzone
Dropzone.autoDiscover = false;
Dropzone.prototype.defaultOptions.dictDefaultMessage = "Clique aqui para adicionar arquivos";
Dropzone.prototype.defaultOptions.dictFallbackMessage = "Your browser does not support drag'n'drop file uploads.";
Dropzone.prototype.defaultOptions.dictFallbackText = "Please use the fallback form below to upload your files like in the olden days.";
Dropzone.prototype.defaultOptions.dictFileTooBig = "Arquivo é grande demais ({{filesize}}MiB). Tamanho máximo: {{maxFilesize}}MiB.";
Dropzone.prototype.defaultOptions.dictInvalidFileType = "Você não pode enviar arquivos deste tipo.";
Dropzone.prototype.defaultOptions.dictResponseError = "Servidor respondeu com {{statusCode}} código.";
Dropzone.prototype.defaultOptions.dictCancelUpload = "Cancelar Upload";
Dropzone.prototype.defaultOptions.dictCancelUploadConfirmation = "Você tem certeza que quer cancelar este envio?";
Dropzone.prototype.defaultOptions.dictRemoveFile = "Remover Arquivo";
Dropzone.prototype.defaultOptions.dictMaxFilesExceeded = "Limite excedido. Este arquivo não será salvo.";

var tables = [];
var maps = [];
var application = {
    index: function () {
        // Menu, Title, Username
        $('ul.sidebar-menu').append(localStorage.getItem('menu'));
        $('span.logo-lg').html(localStorage.getItem('descriptionmenu'));
        $('span.logo-mini').html(localStorage.getItem('descriptionmenumini'));

        if ($('a[href="' + window.location.pathname + '"]')[0]) {
            $('section.content-header h1').text($('a[href="' + window.location.pathname + '"]').text());
        }

        document.title = $('section.content-header').text() || localStorage.getItem('descriptionmenu') || 'Sistema';

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

        var pagecookie = Cookies.get(window.location.href) ? JSON.parse(Cookies.get(window.location.href)) : {};
        if ('currentTab' in pagecookie) {
            $('ul.nav a[href="' + pagecookie.currentTab + '"]').tab('show');
        }

        // Events
        $(window).on('resize', function () {
            if ($(window).width() < 768) {
                $('body').removeClass('sidebar-collapse');
                Cookies.remove('sidebar-collapse');
            }
        });
        $(window).bind('pageshow', function (event) {
            if (event.originalEvent.persisted || event.persisted) {
                window.location.reload();
            }
        });
        $('a[data-toggle="tab"]').on('shown.bs.tab', function (e) {
            $.fn.dataTable.tables({ visible: true, api: true }).columns.adjust();
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
                    if (response.success) {
                        if ($this.attr('data-modal') == 'true') {
                            $this.find('div.modal').modal('hide');
                        }
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
                , data: {
                    id: application.functions.getId()
                    , ids: ids
                    , parent: application.functions.getUrlParameter('parent')
                }
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
        $(document).on('click', 'a.btndeselectall', function () {
            var $table = $(this).parent().siblings('table');
            var selected = $table.attr('data-selected').split(',');
            for (var i = 0; i < selected.length; i++) {
                tables[$table[0].id].row('tr#' + selected[i]).deselect();
            }
            $table.attr('data-selected', '');
            $('#' + $table[0].id + '_info').find('a').remove();
        });
        $(document).ajaxStart(function () {
            $('.pace').removeClass('pace-inactive').addClass('pace-active');
        });
        $(document).ajaxComplete(function (e, xhr) {
            if (xhr.status == 401 && window.location.pathname != '/login') {
                window.location.href = '/login';
            }
            $('.pace').removeClass('pace-active').addClass('pace-inactive');
        });
        $('.nav-tabs a').click(function (e) {
            var pagecookie = Cookies.get(window.location.href) ? JSON.parse(Cookies.get(window.location.href)) : {};
            pagecookie.currentTab = this.hash;
            Cookies.set(window.location.href, JSON.stringify(pagecookie));
        });
        //Filter
        $(document).on('click', 'button.btnfilter', function () {
            var $this = $(this);
            var table = $this.attr('data-table');
            $('#' + table + 'filter').modal('show');
            if (!application.functions.isMobile()) {
                $('#' + table + 'filter').on('shown.bs.modal', function () {
                    setTimeout(function () {
                        application.functions.focusFirstElement($(this));
                    }.apply(this), 200);
                    $('#' + table + 'filter').unbind('shown.bs.modal');
                });
            }
        });
        $(document).on('click', 'button.btngofilter', function (e) {
            var $modal = $(this).closest('div.modal');
            var table = $modal.attr('data-table');

            application.tables.saveFilter(table);
            tables[table].ajax.reload();
            application.tables.reloadFooter(table);

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
        $(document).ready(function (e) {
            if (localStorage.getItem('msg')) {
                application.notify.success(localStorage.getItem('msg'));
                localStorage.removeItem('msg');
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
            application.components.file($('div[data-type="file"]'));
            application.components.georeference($('div[data-type="georeference"]'));
            application.components.table($('table.dataTable'));
        }
        , renderInside: function ($el) {
            application.components.date($el.find('input[data-type="date"]'));
            application.components.datetime($el.find('input[data-type="datetime"]'));
            application.components.time($el.find('input[data-type="time"]'));
            application.components.integer($el.find('input[data-type="integer"]'));
            application.components.decimal($el.find('input[data-type="decimal"]'));
            application.components.autocomplete($el.find('select[data-type="autocomplete"]'));
            application.components.file($el.find('div[data-type="file"]'));
            application.components.georeference($el.find('div[data-type="georeference"]'));
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
            $obj.each(function () {
                $(this).maskMoney({ allowEmpty: true, allowZero: true, allowNegative: true, thousands: '', decimal: ':', precision: 2 });
            });
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
        , file: function ($obj) {

            var previewTemplate = '<div class="dz-preview dz-file-preview">'
                + '<div class="dz-image">'
                + '<img data-dz-thumbnail />'
                + '</div>'
                + '<div class="dz-details">'
                + '<div class="dz-filename">'
                + '<div class="dz-size"><span data-dz-size></span></div>'
                + '<span data-dz-name></span>'
                + '</div>'
                + '</div>'
                + '<div class="dz-progress">'
                + '<span class="dz-upload" data-dz-uploadprogress></span>'
                + '</div>'
                + '<div class="dz-error-message">'
                + '<span data-dz-errormessage></span>'
                + '</div>'
                + '<div class="dz-success-mark">'
                + '<i class="fa fa-3x fa-check-circle-o"></i>'
                + '</div>'
                + '<div class="dz-error-mark">'
                + '<i class="fa fa-3x fa-times"></i>'
                + '</div>'
                + '<button type="button" class="btn btn-xs btn-block btn-danger" data-dz-remove style="border-top-left-radius: 0; border-top-right-radius: 0;">Remover</button>'
                + '</div>';

            $obj.each(function () {
                var dz = new Dropzone(this, {
                    url: "/file"
                    , previewTemplate: previewTemplate
                    , maxFiles: $(this).attr('data-maxfiles') || null
                    , acceptedFiles: $(this).attr('data-acceptedfiles') || null
                    , success: function (file, response) {
                        if (file.previewElement) {
                            file.previewElement.classList.add("dz-success");
                        }
                        var $hidden = $(this.element).find('input[type="hidden"]');
                        var value = $hidden.val() ? JSON.parse($hidden.val()) : [];
                        value.push({
                            id: response.data.id
                            , filename: response.data.filename
                            , mimetype: response.data.mimetype
                            , size: response.data.size
                            , type: response.data.type
                        });
                        $hidden.val(JSON.stringify(value));
                        $(file.previewElement).attr('data-id', response.data.id);
                    }
                });
                dz.on('addedfile', function (file) {
                    $(file.previewElement).attr('data-id', file.id);
                });
                dz.on('removedfile', function (file) {
                    if (file.accepted) {
                        var fileid = $(file.previewElement).attr('data-id');
                        var $hidden = $(this.element).find('input[type="hidden"]');
                        var value = JSON.parse($hidden.val());
                        for (var i = 0; i < value.length; i++) {
                            if (value[i].id == fileid) {
                                value.splice(i, 1);
                            }
                        }
                        if (value.length > 0) {
                            $hidden.val(JSON.stringify(value));
                        } else {
                            $hidden.val('');
                        }
                    }
                });

                var value = $(this).find('input[type="hidden"]').val();
                var obj = value ? JSON.parse(value) : [];
                for (var i = 0; i < obj.length; i++) {
                    var mockFile = { id: obj[i].id, name: obj[i].filename, size: obj[i].size, type: obj[i].mimetype, accepted: true };
                    dz.emit("addedfile", mockFile);
                    if (obj[i].mimetype.match(/image.*/)) {
                        dz.emit("thumbnail", mockFile, '/files/' + obj[i].id + '.' + obj[i].type);
                    }
                    dz.emit("complete", mockFile);
                    dz.files.push(mockFile);
                }

                $(this).on('click', 'div.dz-preview', function () {
                    $.ajax({
                        url: '/file/preview/' + $(this).attr('data-id')
                        , type: 'GET'
                        , dataType: 'json'
                        , success: function (response) {
                            application.handlers.responseSuccess(response);
                        }
                        , error: function (response) {
                            application.handlers.responseError(response);
                        }
                    });
                });

            });
        }
        , georeference: function ($obj) {
            if ($obj.length > 0) {
                var realrender = function ($obj) {
                    var myOptions = {
                        zoom: 3
                        , center: { lat: -16.591987, lng: -50.520225 }
                        , gestureHandling: 'cooperative'
                        , disableDefaultUI: true
                    };

                    var dragfunction = function () {
                        this.hidden.val(this.getPosition().lat() + ',' + this.getPosition().lng());
                    }

                    $obj.each(function () {
                        $(this).css('height', '350px');
                        var $hidden = $(this).parent().find('input[type="hidden"]');

                        maps[$hidden.attr('name')] = new google.maps.Map(this, myOptions);
                        maps[$hidden.attr('name')].hidden = $hidden;
                        maps[$hidden.attr('name')].name = $hidden.attr('name');

                        if ($hidden.val()) {
                            maps[$hidden.attr('name')].marker = new google.maps.Marker({
                                position: new google.maps.LatLng($hidden.val().split(',')[0], $hidden.val().split(',')[1])
                                , map: maps[$hidden.attr('name')]
                                , hidden: $hidden
                                , draggable: true
                            });
                            google.maps.event.addListener(maps[$hidden.attr('name')].marker, 'dragend', dragfunction);
                            maps[$hidden.attr('name')].setCenter(new google.maps.LatLng($hidden.val().split(',')[0], $hidden.val().split(',')[1]));
                            maps[$hidden.attr('name')].setZoom(15);
                        } else {
                            maps[$hidden.attr('name')].marker = null;
                        }

                        google.maps.event.addListener(maps[$hidden.attr('name')], 'click', function (e) {
                            if (this.marker) {
                                this.marker.setPosition(e.latLng);
                                this.marker.hidden.val(this.marker.getPosition().lat() + ',' + this.marker.getPosition().lng());
                            } else {
                                maps[this.name].marker = new google.maps.Marker({
                                    position: e.latLng
                                    , map: maps[this.name]
                                    , hidden: maps[this.name].hidden
                                    , draggable: true
                                });
                                maps[this.name].hidden.val(e.latLng.lat() + ',' + e.latLng.lng());
                                google.maps.event.addListener(maps[this.name].marker, 'dragend', dragfunction);
                            }
                        });
                    });
                }

                if (typeof google === 'object' && typeof google.maps === 'object') {
                    realrender($obj);
                } else {
                    application.jsfunction('platform.config.__getGoogleMapsKey', {}, function (response) {
                        $.getScript('https://maps.googleapis.com/maps/api/js?key=' + response.data, function () {
                            realrender($obj);
                        });
                    });
                }
            }
        }
        , autocomplete: function ($obj) {
            $obj.each(function () {
                var where = $(this).attr('data-where');
                var needreplace = where && where.indexOf('$parent') >= 0;
                var $modal = $(this).closest('div.modal').attr('data-table');
                if ($modal) {
                    if (needreplace) {
                        where = where.replace(/\$parent/g, application.functions.getId());
                    }
                } else {
                    if (needreplace) {
                        if (application.functions.getUrlParameter('parent')) {
                            where = where.replace(/\$parent/g, application.functions.getUrlParameter('parent'));
                        } else {
                            where = '';
                        }
                    }
                }
                $(this).attr('data-where', where);
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
            });
        }
        , table: function ($obj) {
            $obj.each(function () {
                var $this = $(this);
                if ($this.attr('data-view')) {
                    $.ajax({
                        url: '/view/' + $this.attr('data-view') + '/config'
                        , type: 'POST'
                        , dataType: 'json'
                        , data: {
                            issubview: $this.attr('data-subview') || false
                        }
                        , success: function (response) {
                            application.tables.create(response);
                        }
                        , error: function (response) {
                            application.notify.error(response);
                        }
                    });
                }
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
                    editButton = '<button id="' + sTableId + '_edit" type="button" class="btn btn-default" data-table="' + sTableId + '" title="Editar"><i class="fa fa-edit"></i></button>';
                } else {
                    editButton = '<button id="' + sTableId + '_edit" type="button" class="btn btn-default" data-table="' + sTableId + '" title="Editar"><i class="fa fa-search"></i></button>';
                }

                var deleteButton = '';
                if ($('#' + sTableId).attr('data-deletable') == 'true') {
                    deleteButton = '<button id="' + sTableId + '_delete" type="button" class="btn btn-default" data-table="' + sTableId + '"  title="Excluir"><i class="fa fa-trash"></i></button>';
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
                $('button#' + sTableId + '_edit').click(function (e) {
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
                        var href = '/view/' + idview + '/' + selected[selected.length - 1] + add;
                        window.location.href = href;
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
                                    if (response.success) {
                                        application.tables.reloadAll();
                                    }
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

                // Events
                var html = '<div class="col-md-12 btn-group-top-datatables no-padding">';
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

                // Filter Button
                html += '<div class="btn-group btn-group-filter">'
                    + '<button type="button" class="btn btnfilter ' + (data.filter.count > 0 ? 'btn-primary' : 'btn-default') + '" data-table="tableview' + data.name + '">'
                    + '<i class="fa fa-search fa-flip-horizontal"></i>'
                    + '</button>'
                    + '</div>'
                    + '</div>';
                $(html).insertBefore('#tableview' + data.name);

            }

            // Renders
            for (var i = 0; i < data.columns.length; i++) {
                if (data.columns[i].render) {
                    data.columns[i].render = application.tables.renders[data.columns[i].render];
                }
            }

            // Footer
            if (data.footer) {
                $('#tableview' + data.name).append(data.footer);
            }

            // Filter Modal
            $('body').append(application.modal.create({
                id: 'tableview' + data.name + 'filter'
                , title: 'Filtro'
                , body: data.filter.html
                , footer: '<button type="button" class="btn btn-default" data-dismiss="modal">Cancelar</button> <button type="button" class="btn btncleanfilter btn-default">Limpar</button> <button type="button" class="btn btngofilter btn-primary">Filtrar</button>'
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
                , drawCallback: function (settings) {
                    var selected = $(settings.nTable).attr('data-selected');
                    if (selected) {
                        selected = selected.split(',');
                        for (var i = 0; i < selected.length; i++) {
                            tables[settings.sInstance].row('tr#' + selected[i]).select();
                        }
                        $('#' + settings.sInstance + '_info').find('a').remove();
                        $('#' + settings.sInstance + '_info').append('<a class="btndeselectall" href="javascript:void(0)"> - Desmarcar ' + selected.length + ' Selecionado(s) </a>');
                    }
                }
                , ordering: data.permissions.orderable
                , stateSave: true
                , columns: data.columns
                , select: {
                    style: 'multi'
                    , info: false
                }
                , processing: true
                , serverSide: true
                , ajax: function (data, callback, settings) {
                    $.ajax({
                        url: '/datatables'
                        , type: 'POST'
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
                    $(document).trigger('app-datatable', settings.sTableId);
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
                $('#' + $this[0].id + '_info').find('a').remove();
                $('#' + $this[0].id + '_info').append('<a class="btndeselectall" href="javascript:void(0)"> - Desmarcar ' + selected.length + ' Selecionado(s) </a>');
            }).on('deselect', function (e, dt, type, indexes) {
                var $this = $(this);
                var rowData = tables[$this[0].id].rows(indexes).data().toArray()[0];
                var id = '' + rowData.id;
                var selected = $this.attr('data-selected');
                if (selected) {
                    selected = selected.split(',');
                    var index = $.inArray(id, selected);
                    selected.splice(index, 1);

                    $('#' + $this[0].id + '_info').find('a').remove();
                    if (selected.length > 0) {
                        $('#' + $this[0].id + '_info').append('<a class="btndeselectall" href="javascript:void(0)"> - Desmarcar ' + selected.length + ' Selecionado(s) </a>');
                    }
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
                    var href = '/view/' + idview + '/' + tables[tableid].row(this).data().id + add
                    if (e.ctrlKey) {
                        window.open(href);
                    } else {
                        window.location.href = href;
                    }
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
                    , type: 'POST'
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
            , image100: function (value) {
                if (value) {
                    var j = JSON.parse(value);
                    if (j[0].mimetype.match(/image.*/)) {
                        return '<img src="/files/' + j[0].id + '.' + j[0].type + ' " style="max-height: 100px;">';
                    } else {
                        return '';
                    }
                } else {
                    return '';
                }
            }
            , image150: function (value) {
                if (value) {
                    var j = JSON.parse(value);
                    if (j[0].mimetype.match(/image.*/)) {
                        return '<img src="/files/' + j[0].id + '.' + j[0].type + ' " style="max-height: 150px;">';
                    } else {
                        return '';
                    }
                } else {
                    return '';
                }
            }
            , image200: function (value) {
                if (value) {
                    var j = JSON.parse(value);
                    if (j[0].mimetype.match(/image.*/)) {
                        return '<img src="/files/' + j[0].id + '.' + j[0].type + ' " style="max-height: 200px;">';
                    } else {
                        return '';
                    }
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
            , url: function (value) {
                if (value) {
                    return '<a target="_blank" href="' + value + '">' + value + '</a>';
                } else {
                    return '';
                }
            }
            , iconawesome: function (value) {
                if (value) {
                    return value + '<i class="fa fa-check"></i>'
                } else {
                    return '<i class="fa fa-check"></i>'
                }
            }
            , fin_categoria_dc: function (value) {
                if (value == 1) {
                    return '<span class="label label-danger">Débito</span>';
                } else {
                    return '<span class="label label-success">Crédito</span>';
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
                        , className: ''
                    }
                    , confirm: {
                        label: 'Sim'
                        , className: 'btn-primary'
                        , callback: function () {
                            functionSuccess();
                        }
                    }
                }
            });
        }
        , focusFirstElement: function ($selector) {
            $selector.find('input,textarea,select,radio').filter(':enabled:visible:first').focus();
        }
        , getCss: function (array) {
            for (var i = 0; i < array.length; i++) {
                $('<link/>', {
                    rel: 'stylesheet', type: 'text/css', href: array[i]
                }).appendTo('head');
            }
        }
        , getJs: function (array) {
            $.ajaxSetup({ cache: true });
            if (array.length > 0) {
                $.getScript(array[0], function () {
                    array.shift();
                    application.functions.getJs(array);
                });
            } else {
                $(document).trigger('app-loadjs');
                $.ajaxSetup({ cache: false });
            }
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

                if ('msg' in response && ('redirect' in response || 'historyBack' in response)) {
                    localStorage.setItem('msg', response.msg);
                }

                if ('historyBack' in response && response.historyBack) {
                    if (window.history.length > 1) {
                        return window.history.back();
                    } else {
                        localStorage.removeItem('msg');
                        window.close();
                    }
                }

                if ('redirect' in response) {
                    var redirect = response.redirect + window.location.search;
                    if (application.functions.getId() == 0)
                        window.history.replaceState(null, null, redirect);
                    return window.location.href = redirect;
                }

                if ('msg' in response) {
                    application.notify.success(response.msg);
                }

                if ('openurl' in response) {
                    window.open(response.openurl);
                }

                if ('modal' in response) {
                    if ('form' in response.modal && response.modal.form) {
                        $('body').append('<form class="xhr" autocomplete="off" data-modal="true" action="' + (response.modal.action || '') + '">' + application.modal.create(response.modal) + '</form>');
                    } else {
                        $('body').append(application.modal.create(response.modal));
                    }

                    application.components.renderInside($('#' + response.modal.id));
                    $(document).trigger('app-modal', response.modal);
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
            if (response.status == 0) {
                application.notify.error('Sistema indisponível, tente novamente mais tarde');
            } else if (response.status == 401) {
                application.notify.error('Acesso não autorizado');
            } else {
                application.notify.error('Alguma coisa deu errado :(');
            }
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
                , z_index: 10310
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
    , route: {
        handler: function (data, func) {
            $.ajax({
                type: 'POST'
                , dataType: 'json'
                , data: data
                , success: function (response) {
                    func(response);
                }
                , error: function (response) {
                    application.handlers.responseError(response);
                }
            });
        }
    }
    , jsfunction: function (name, obj, func) {
        $.ajax({
            url: '/jsfunction'
            , type: 'POST'
            , dataType: 'json'
            , data: {
                name: name
                , data: obj
            }
            , success: function (response) {
                func(response);
            }
            , error: function (response) {
                application.handlers.responseError(response);
            }
        });
    }
}