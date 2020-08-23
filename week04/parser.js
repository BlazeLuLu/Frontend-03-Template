const css = require('css');
const EOF = Symbol('EOF'); //EOF: end of a file
const layout = require('./layout.js');

let currentToken = null;//用于逐步构造Token内容
let currentAttribute = null;
let currentTextNode = null;
let stack = [{ type: 'document', children: [] }]

//加入一个新的函数，addCSSRules，这里我们把CSS规则暂存到一个数组里
let rules = []; //用于保存收集到的CSS规则
function addCSSRules(text) {
    var ast = css.parse(text); //利用css.parse把text变成ast
    //console.log(JSON.stringify(ast, null, "    "));
    rules.push(...ast.stylesheet.rules);
}

//当前只支持， 并且不支持连着写： div.a#a
function match(element, selector) { //接收element和selector参数
    if (!selector || !element.attributes) {
        return false;
    }
    //三种选择器
    //#a
    //.a
    //div
    if (selector.charAt(0) === '#') {
        var attr = element.attributes.filter(attr => attr.name === 'id')[0];
        if (attr && attr.value === selector.replace('#', '')) {
            return true;
        }
    } else if (selector.charAt(0) === '.') {
        var attr = element.attributes.filter(attr => attr.name === 'class')[0];
        if (attr && attr.value === selector.replace('.', '')) {
            return true;
        }
    } else {
        if (element.tagName === selector) {
            return true;
        }
    }
    return false;
}

//specificity的计算逻辑
function specificity(selector) {
    var p = [0, 0, 0, 0];
    var selectorParts = selector.split(" ");
    for (var part of selectorParts) {
        if (part.charAt(0) === '#') {
            p[1] += 1;
        } else if (part.charAt(0) === '.') {
            p[2] += 1;
        } else {
            p[3] += 1;
        }
    }
    return p;
}

function compare(sp1, sp2) {
    if (sp1[0] - sp2[0]) {
        return sp1[0] - sp2[0];
    }
    if (sp1[1] - sp2[1]) {
        return sp1[1] - sp2[1];
    }
    if (sp1[2] - sp2[2]) {
        return sp1[2] - sp2[2];
    }

    return sp1[3] - sp2[3];
}

function computeCSS(element) {
    // console.log(rules); //获取rules
    // console.log("compute css for element ", element);
    var elements = stack.slice().reverse(); //获取父元素序列
    if (!element.computedStyle) { //判断是否匹配
        element.computedStyle = {};
    }

    // 选择器/父级元素执行双循环
    // j: selectors index
    // i: elements index
    for (let rule of rules) {
        var selectorParts = rule.selectors[0].split(' ').reverse();
        
        if (!match(element, selectorParts[0])) {
            continue;
        }

        let matched = false;

        var j = 1;

        for (var i = 0; i < elements.length; i++) {
            if (match(elements[i], selectorParts[j])) {
                j++;
            }
        }

        if (j >= selectorParts.length) {
            matched = true;
        }

        if (matched) {
            // 如果匹配， 把对应的css属性加入对应dom节点
            console.log("Element", element, "matched rule", rule);
            var sp = specificity(rule.selectors[0]);
            var computedStyle = element.computedStyle;
            for (var declaration of rule.declarations) {
                if (!computedStyle[declaration.property]) {
                    computedStyle[declaration.property] = {};
                }
                if (!computedStyle[declaration.property].specificity) {
                    computedStyle[declaration.property].value = declaration.value;
                    computedStyle[declaration.property].specificity = sp;
                } else if (compare(computedStyle[declaration.property].specificity, sp) < 0) {
                    computedStyle[declaration.property].value = declaration.value;
                    computedStyle[declaration.property].specificity = sp;
                }

            }
        }


    }
}

//emit(token)函数，同一个出口输出
function emit(token) {
    //console.log(token);
    // if(token.type === "text") //如果是文本节点，忽略掉
    //     return;

    let top = stack[stack.length - 1]; //用数组表示stack，取出栈顶

    if (token.type === 'startTag') { //startTag入栈element操作
        let element = {
            type: 'element',
            children: [],
            attributes: []
        };

        element.tagName = token.tagName;

        for (let p in token) {
            if (p != "type" && p != "tagName") { //除了type和tagName之外的属性都push进element的一个属性的池子里
                element.attributes.push({
                    name: p,
                    value: token[p]
                });
            }
        }

        computeCSS(element); //计算CSS的时机是在startTag入栈时操作，把element传入computeCSS

        top.children.push(element); //入栈之前，top的children里面加上这个element
        element.parent = top; //把元素的parent设成top

        if (!token.isSelfClosing) { //是自封闭的没必要入栈
            stack.push(element);
        }

        currentTextNode = null;

    } else if (token.type === 'endTag') {
        if (top.tagName !== token.tagName) { //如果tagName不相等
            throw new Error("Tag start end don't match!");
        } else {
            // 遇到css标签， 执行添加css规则操作
            if (top.tagName === 'style') { 
                addCSSRules(top.children[0].content);
            }
            layout(top);//在endTag标签之前，调用layout函数
            stack.pop();
        }
        currentTextNode = null;
    } else if (token.type === 'text') {//节点类型是否为文本
        if (currentTextNode === null) {
            currentTextNode = {
                type: 'text',
                content: ""
            }
            top.children.push(currentTextNode);
        }
        currentTextNode.content += token.content;
    }
}

//data状态是初始状态
function data(c) {
    //判断是否为一个tag
    if (c === '<') { //遇到小于号进入tagOpen状态
        return tagOpen;
    } else if (c === EOF) {  //EOF返回结束状态
        emit({
            type: 'EOF', //是EOF的话emit一个EOF token
        });
        return;
    } else {
        emit({
            type: 'text', //文本节点emit一个text token
            content: c, //content是文本节点利的一个字符
        });
        return data;
    }
}

//tgaOpen状态
function tagOpen(c) {
    if (c === '/') { //判断是否为结束标签
        return endTagOpen;
    } else if (c.match(/^[a-zA-Z]$/)) {
        currentToken = {
            type: 'startTag',//给currentToken一个初始值
            tagName: "",
        };
        return tagName(c);
    } else {
        return;
    }
}

//endTagOpen状态
function endTagOpen(c) {
    if (c.match(/^[a-zA-Z]$/)) {
        currentToken = {
            type: 'endTag',//创造一个endTag标签token
            tagName: '',
        };
        return tagName(c);
    } else if (c === '>') {

    } else if (c === EOF) {

    } else {

    }
}

//tagName标签，核心逻辑
function tagName(c) {
    if (c.match(/^[\t\n\f ]$/)) { //tap符、换行符、禁止符和空格，后面跟属性
        return beforeAttributeName;
    } else if (c === '/') { //判断是否为自封闭标签
        return selfClosingStartTag;
    } else if (c.match(/^[a-zA-Z]$/)) {
        currentToken.tagName += c;
        return tagName;
    } else if (c === '>') { //普通的开始标签
        emit(currentToken);
        return data;
    } else {
        return tagName;
    }
}

//beforeAttributeName，处理属性开始
function beforeAttributeName(c) {
    if (c.match(/^[\t\n\f ]$/)) {
        return beforeAttributeName;
    } else if (c === '/' || c === '>' || c === EOF) {
        return afterAttributeName(c)
    } else if (c === '=') {

    } else {
        currentAttribute = {
            name: "",
            value: ""
        }
        //console.log("CurrentAttribute", currentAttribute)
        return attributeName(c);
    }
}

function attributeName(c) {
    //console.log(currentAttribute);
    if (c.match(/^[\t\n\f ]$/) || c === '/' || c === '>' || c === EOF) { //判断是否进入afterAttributeName状态
        return afterAttributeName(c);
    } else if (c === '=') { //判断是否进入beforeAttributeValue状态
        return beforeAttributeValue;
    } else if (c === '\u0000') {

    } else if (c === '\"' || c === "'" || c === "<") {

    } else {
        currentAttribute.name += c;
        return attributeName;
    }
}

function beforeAttributeValue(c) {
    if (c.match(/^[\t\n\f ]$/) || c === '/' || c === '>' || c === EOF) {
        return beforeAttributeValue(c);
    } else if (c === '\"') {
        return doubleQuotedAttributeValue;
    } else if (c === "\'") {
        return singleQuotedAttributeValue;
    } else if (c === '>') {

    } else {
        return UnquotedAttributeValue;
    }
}

//double-quoted状态只找双引号结束
function doubleQuotedAttributeValue(c) {
    if (c === '\"') {
        currentToken[currentAttribute.name] = currentAttribute.value;
        return afterQuotedAttributeValue;
    } else if (c === '\u0000') {

    } else if (c === EOF) {

    } else {
        currentAttribute.value += c;
        return doubleQuotedAttributeValue;
    }
}

//single-quoted只找单引号结束
function singleQuotedAttributeValue(c) {
    if (c === "\‘") {
        currentToken[currentAttribute.name] = currentAttribute.value;
        return afterQuotedAttributeValue;
    } else if (c === '\u0000') {

    } else if (c === EOF) {

    } else {
        currentAttribute.value += c;
        return singleQuotedAttributeValue;
    }
}

function afterQuotedAttributeValue(c) {
    if (c.match(/^[\t\n\f ]$/)) {
        return beforeAttributeName;
    } else if (c === '/') {
        return selfClosingStartTag;
    } else if (c === '>') {
        currentToken[currentAttribute.name] = currentAttribute.value;
        emit(currentToken);
        return data;
    } else if (c === EOF) {

    } else {
        currentAttribute.value += c;
        return doubleQuotedAttributeValue;
    }
}

//Unquoted只找空白符结束
function UnquotedAttributeValue(c) {
    if (c.match(/^[\t\n\f ]$/)) {
        currentToken[currentAttribute.name] = currentAttribute.value;
        return beforeAttributeName;
    } else if (c === '/') {
        currentToken[currentAttribute.name] = currentAttribute.value;
        return selfClosingStartTag;
    } else if (c === '>') {
        currentToken[currentAttribute.name] = currentAttribute.value;
        emit(currentToken);
        return data;
    } else if (c === '\u0000') {

    } else if (c === '\"' || c === "'" || c === '<' || c === "`") {

    } else if (c === EOF) {

    } else {
        currentAttribute.value += c;
        return UnquotedAttributeValue;
    }
}



function selfClosingStartTag(c) {
    if (c === '>') {
        currentToken.isSelfClosing = true;
        emit(currentToken);
        return data;
    } else if (c === 'EOF') {

    } else {

    }
}

function afterAttributeName(c) {
    if (c.match(/^[\t\n\f ]$/)) {
        return afterAttributeName;
    } else if (c === '/') {
        return selfClosingStartTag;
    } else if (c === '=') {
        return beforeAttributeValue;
    } else if (c === '>') {
        currentToken[currentAttribute.name] = currentAttribute.value;
        emit(currentToken);
        return data;
    } else if (c === EOF) {

    } else {
        currentToken[currentAttribute.name] = currentAttribute.value;
        currentAttribute = {
            name: '',
            value: ''
        };
        return attributeName(c);
    }
}

// module.exports.parseHTML = function parseHTML(html){
//     let state = data;
//     for(let c of html){
//         state = state(c);
//     }
//     state = state(EOF);
// }

//状态机
module.exports.parserHTML = (html) => {
    let state = data;
    for (let c of html) {
        state = state(c);
    }
    state = state(EOF);
    return stack;
} 