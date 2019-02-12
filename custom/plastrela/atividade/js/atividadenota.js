$(function () {

    CKEDITOR_BASEPATH = '/public/assets/ckeditor/';
    application.functions.getJs([
        '/public/assets/ckeditor/ckeditor.js'
    ]);

    $(document).on('app-loadjs', function () {
        var config = {
            toolbarGroups: [
                { name: 'document', groups: ['mode', 'document', 'doctools'] },
                { name: 'clipboard', groups: ['clipboard', 'undo'] },
                { name: 'editing', groups: ['find', 'selection', 'spellchecker', 'editing'] },
                { name: 'forms', groups: ['forms'] },
                { name: 'basicstyles', groups: ['basicstyles', 'cleanup'] },
                { name: 'paragraph', groups: ['list', 'indent', 'blocks', 'align', 'bidi', 'paragraph'] },
                { name: 'links', groups: ['links'] },
                { name: 'insert', groups: ['insert'] },
                { name: 'styles', groups: ['styles'] },
                { name: 'colors', groups: ['colors'] },
                { name: 'tools', groups: ['tools'] },
                { name: 'about', groups: ['about'] },
                { name: 'others', groups: ['others'] }
            ]
            , removeButtons: 'Preview,Print,NewPage,Save,Source,Templates,Cut,Copy,Paste,PasteText,PasteFromWord,Find,Undo,Redo,Replace,SelectAll,Scayt,Form,Checkbox,Radio,TextField,Textarea,Select,Button,ImageButton,HiddenField,Strike,Subscript,Superscript,CopyFormatting,RemoveFormat,NumberedList,Outdent,Indent,Blockquote,CreateDiv,BidiLtr,BidiRtl,Language,Anchor,Flash,Smiley,SpecialChar,PageBreak,Iframe,Styles,Format,Font,ShowBlocks,About'
        };
        CKEDITOR.replace('descricao', config);
    });

});