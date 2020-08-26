//Date.prototype.formatLocale = function(fmt){return formatDate.call(this,fmt,'locale')}
//Date.prototype.formatUTC = function(fmt){return formatDate.call(this,fmt,'utc')}

 function formatDate(date, fmt, type) {
    var o
    if (type === 'locale') {
        o = {
            "M+": date.getMonth() + 1,                 //月份
            "d+": date.getDate(),                    //日
            "h+": date.getHours(),                   //小时
            "m+": date.getMinutes(),                 //分
            "s+": date.getSeconds(),                 //秒
            "q+": Math.floor((date.getMonth() + 3) / 3), //季度
            "S": date.getMilliseconds()             //毫秒
        }
        if (/(y+)/.test(fmt)) {//设置年
            fmt = fmt.replace(RegExp.$1, (date.getFullYear() + "").substr(4 - RegExp.$1.length));
        }
    } else if (type === 'utc' || type === 'UTC') {
        o = {
            "M+": date.getUTCMonth() + 1,                 //月份
            "d+": date.getUTCDate(),                    //日
            "h+": date.getUTCHours(),                   //小时
            "m+": date.getUTCMinutes(),                 //分
            "s+": date.getUTCSeconds(),                 //秒
            "q+": Math.floor((date.getUTCMonth() + 3) / 3), //季度
            "S": date.getUTCMilliseconds()             //毫秒
        };
        if (/(y+)/.test(fmt)) {//设置年
            fmt = fmt.replace(RegExp.$1, (date.getUTCFullYear() + "").substr(4 - RegExp.$1.length));
        }
    } else {
        throw Error("type参数不正确。")
    }
    //设置除了年以外的部分
    for (var k in o) {
        if (new RegExp("(" + k + ")").test(fmt)) {
            fmt = fmt.replace(RegExp.$1, (RegExp.$1.length === 1) ? (o[k]) : (("00" + o[k]).substr(("" + o[k]).length)));
        }
    }
    return fmt;
}


 function parseDate(dateStr, fmt, type) {


    var date
    var o
    if (type === 'locale') {
        date = new Date()
        date.setMonth(0,1)
        date.setHours(0,0,0,0)
        o = {
            "y+": 'setFullYear',
            "M+": 'setMonth',                 //月份
            "d+": 'setDate',                    //日
            "h+": 'setHours',                   //小时
            "m+": 'setMinutes',                 //分
            "s+": 'setSeconds',                 //秒
            "S": 'setMilliseconds'             //毫秒
        }

    } else if (type === 'utc' || type === 'UTC') {
        date = new Date()
        date.setUTCMonth(0,1)
        date.setUTCHours(0,0,0,0)
        o = {
            "y+": 'setUTCFullYear',
            "M+": 'setUTCMonth',                 //月份
            "d+": 'setUTCDate',                    //日
            "h+": 'setUTCHours',                   //小时
            "m+": 'setUTCMinutes',                 //分
            "s+": 'setUTCSeconds',                 //秒
            "S": 'setUTCMilliseconds'             //毫秒
        };

    } else {
        throw Error("type参数不正确。")
    }

    for (var k in o) {
        if (new RegExp("(" + k + ")").test(fmt)) {
            //console.log(k+":"+fmt.indexOf(RegExp.$1))
            let val = dateStr.substr(fmt.indexOf(RegExp.$1), RegExp.$1.length)

            date[o[k]](k === 'M+' ? val - 1 : val)
            //console.log((k === 'M+')+","+(val-1))
        }

    }


    return date;

}

//console.log(parseDate('2020-06-25 14:50:01.123', 'yyyy-MM-dd hh:mm:ss.S', 'locale').toLocaleString())

exports.formatDate=formatDate
exports.parseDate=parseDate