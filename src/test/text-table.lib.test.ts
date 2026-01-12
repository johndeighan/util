"use strict";
// text-table.lib.test.civet

import {undef} from 'datatypes'
import {DBG} from 'logger'
import {o} from 'llutils'
import {TextTable} from 'text-table'
import {equal, like, objListLike} from 'unit-test'

// -------------------------------------------------------------

DBG("class TextTable");

(() => {
	const table = new TextTable('l r%.2f r%.2f')

	equal(table.hOptions.decPlaces, 2)
	equal(table.hOptions.parseNumbers, false)
	equal(table.numCols, 3)
	equal(table.lCols, [
		{align: 'l', format: undef,  width: 0, total: undef, subtotal: undef},
		{align: 'r', format: '%.2f', width: 0, total: undef, subtotal: undef},
		{align: 'r', format: '%.2f', width: 0, total: undef, subtotal: undef}
		])
	equal(table.lRows, [])
}
	)();

// -------------------------------------------------------------

(() => {
	const table = new TextTable('l r%.2f r%.2f')
	table.labels(['Coffee', 'Jan', 'Feb'])

	equal(table.lRows, [
		{
			opcode: 'labels',
			lRow: ['Coffee', 'Jan', 'Feb']
			}
		])
	equal(table.lCols, [
		{align: 'l', format: undef,  width: 6, total: undef, subtotal: undef},
		{align: 'r', format: '%.2f', width: 3, total: undef, subtotal: undef},
		{align: 'r', format: '%.2f', width: 3, total: undef, subtotal: undef}
		])
}
	)();

// -------------------------------------------------------------

(() => {
	const table = new TextTable('l r%.2f r%.2f')
	table.labels(['Coffee', 'Jan', 'Feb'])
	table.data(  [undef, 30, 40])

	equal(table.lRows, [
		{
			opcode: 'labels',
			lRow: ['Coffee', 'Jan', 'Feb']
			},
		{
			opcode: 'data',
			lRow: ['', '30.00', '40.00']
			}
		])
	equal(table.lCols, [
		{align: 'l', format: undef,  width: 6, total: undef, subtotal: undef},
		{align: 'r', format: '%.2f', width: 5, total: 30, subtotal: 30},
		{align: 'r', format: '%.2f', width: 5, total: 40, subtotal: 40}
		])
}
	)();

// -------------------------------------------------------------

(() => {
	const table = new TextTable('l r%.2f r%.2f')
	table.labels(['Coffee', 'Jan', 'Feb'])
	table.data(  [undef, 30, 40])
	table.data(  [undef, 130, 40])

	equal(table.lRows, [
		{
			opcode: 'labels',
			lRow: ['Coffee', 'Jan', 'Feb']
			},
		{
			opcode: 'data',
			lRow: ['', '30.00', '40.00']
			},
		{
			opcode: 'data',
			lRow: ['', '130.00', '40.00']
			}
		])
	equal(table.lCols, [
		{align: 'l', format: undef,  width: 6, total: undef, subtotal: undef},
		{align: 'r', format: '%.2f', width: 6, total: 160, subtotal: 160},
		{align: 'r', format: '%.2f', width: 5, total: 80, subtotal: 80}
		])
}
	)();

// -------------------------------------------------------------

(() => {
	const table = new TextTable('l r%.2f r%.2f')
	table.labels( ['Coffee', 'Jan', 'Feb'])
	table.data(   [undef, 30, 40])
	table.data(   [undef, 130, 40])

	objListLike(table.lRows, [
		{
			opcode: 'labels',
			lRow: ['Coffee', 'Jan', 'Feb']
			},
		{
			opcode: 'data',
			lRow: ['', '30.00', '40.00']
			},
		{
			opcode: 'data',
			lRow: ['', '130.00', '40.00']
			}
		])
	equal(table.lCols, [
		{align: 'l', format: undef,  width: 6, total: undef, subtotal: undef},
		{align: 'r', format: '%.2f', width: 6, total: 160, subtotal: 160},
		{align: 'r', format: '%.2f', width: 5, total: 80, subtotal: 80}
		])
}
	)();

// -------------------------------------------------------------

(() => {
	const table = new TextTable('l r%.2f r%.2f')
	table.labels( ['Coffee', 'Jan', 'Feb'])
	table.data(   [undef, 30, 40])
	table.data(   [undef, 130, 40])
	table.sep(    '-')
	table.subtotals()

	equal(table.lRows, [
		{
			opcode: 'labels',
			lRow: ['Coffee', 'Jan', 'Feb']
			},
		{
			opcode: 'data',
			lRow: ['', '30.00', '40.00']
			},
		{
			opcode: 'data',
			lRow: ['', '130.00', '40.00']
			},
		{
			opcode: 'sep',
			ch: '-'
			},
		{
			opcode: 'subtotals',
			lRow: ['', '160.00', '80.00']
			}
		])
	equal(table.lCols, [
		{align: 'l', format: undef,  width: 6, total: undef, subtotal: undef},
		{align: 'r', format: '%.2f', width: 6, total: 160, subtotal: 0},
		{align: 'r', format: '%.2f', width: 5, total: 80, subtotal: 0}
		])
}
	)();

// -------------------------------------------------------------

(() => {
	const table = new TextTable('l r%.2f r%.2f')
	table.labels( ['Coffee', 'Jan', 'Feb'])
	table.data(   [undef, 30, 40])
	table.data(   [undef, 130, 40])
	table.sep(    '-')
	table.subtotals()
	table.data(   [undef, 10, 20])
	table.data(   [undef, 1000, 40])

	equal(table.lRows, [
		{
			opcode: 'labels',
			lRow: ['Coffee', 'Jan', 'Feb']
			},
		{
			opcode: 'data',
			lRow: ['', '30.00', '40.00']
			},
		{
			opcode: 'data',
			lRow: ['', '130.00', '40.00']
			},
		{
			opcode: 'sep',
			ch: '-'
			},
		{
			opcode: 'subtotals',
			lRow: ['', '160.00', '80.00']
			},
		{
			opcode: 'data',
			lRow: ['', '10.00', '20.00']
			},
		{
			opcode: 'data',
			lRow: ['', '1000.00', '40.00']
			}
		])
	equal(table.lCols, [
		{align: 'l', format: undef,  width: 6, total: undef, subtotal: undef},
		{align: 'r', format: '%.2f', width: 7, total: 1170, subtotal: 1010},
		{align: 'r', format: '%.2f', width: 5, total: 140, subtotal: 60}
		])
}
	)();

// -------------------------------------------------------------
// NOTE: Pass arrays to labels() and data()

(() => {
	const table = new TextTable('l r%.2f r%.2f')
	table.labels( ['Coffee', 'Jan', 'Feb'])
	table.data(   [undef, 30, 40])
	table.data(   [undef, 130, 40])
	table.sep(    '-')
	table.subtotals()
	table.data(   [undef, 10, 20])
	table.data(   [undef, 1000, 40])
	table.fullsep('=')
	table.totals()

	equal(table.lRows, [
		{
			opcode: 'labels',
			lRow: ['Coffee', 'Jan', 'Feb']
			},
		{
			opcode: 'data',
			lRow: ['', '30.00', '40.00']
			},
		{
			opcode: 'data',
			lRow: ['', '130.00', '40.00']
			},
		{
			opcode: 'sep',
			ch: '-'
			},
		{
			opcode: 'subtotals',
			lRow: ['', '160.00', '80.00']
			},
		{
			opcode: 'data',
			lRow: ['', '10.00', '20.00']
			},
		{
			opcode: 'data',
			lRow: ['', '1000.00', '40.00']
			},
		{
			opcode: 'fullsep',
			ch: '='
			},
		{
			opcode: 'totals',
			lRow: ['', '1170.00', '140.00']
			}
		])
	equal(table.lCols, [
		{align: 'l', format: undef,  width: 6, total: undef, subtotal: undef},
		{align: 'r', format: '%.2f', width: 7, total: 1170, subtotal: 1010},
		{align: 'r', format: '%.2f', width: 6, total: 140, subtotal: 60}
		])
}
	)();

// -------------------------------------------------------------

(() => {
	const table = new TextTable('l r%.2f r%.2f')
	table.title(  'My Expenses')
	table.fullsep('-')
	table.labels( ['Coffee', 'Jan', 'Feb'])
	table.data(   [undef, 30, 40])
	table.data(   [undef, 130, 40])
	table.sep(    '-')
	table.subtotals()
	table.data(   [undef, 10, 20])
	table.data(   [undef, 1000, 40])
	table.fullsep('=')
	table.totals()

	equal(table.lRows, [
		{
			opcode: 'title',
			title: 'My Expenses',
			align: 'center'
			},
		{
			opcode: 'fullsep',
			ch: '-'
			},
		{
			opcode: 'labels',
			lRow: ['Coffee', 'Jan', 'Feb']
			},
		{
			opcode: 'data',
			lRow: ['', '30.00', '40.00']
			},
		{
			opcode: 'data',
			lRow: ['', '130.00', '40.00']
			},
		{
			opcode: 'sep',
			ch: '-'
			},
		{
			opcode: 'subtotals',
			lRow: ['', '160.00', '80.00']
			},
		{
			opcode: 'data',
			lRow: ['', '10.00', '20.00']
			},
		{
			opcode: 'data',
			lRow: ['', '1000.00', '40.00']
			},
		{
			opcode: 'fullsep',
			ch: '='
			},
		{
			opcode: 'totals',
			lRow: ['', '1170.00', '140.00']
			}
		])
	equal(table.lCols, [
		{align: 'l', format: undef,  width: 6, total: undef, subtotal: undef},
		{align: 'r', format: '%.2f', width: 7, total: 1170, subtotal: 1010},
		{align: 'r', format: '%.2f', width: 6, total: 140, subtotal: 60}
		])
}
	)();

// -------------------------------------------------------------

(() => {
	const table = new TextTable('l r%.2f r%.2f')
	table.title(  'My Expenses')
	table.fullsep('-')
	table.labels( ['Coffee', 'Jan', 'Feb'])
	table.data(   [undef, 30, 40])
	table.data(   [undef, 130, 40])
	table.sep(    '-')
	table.subtotals()
	table.data(   [undef, 10, 20])
	table.data(   [undef, 1000, 40])
	table.fullsep('=')
	table.totals()

	equal(table.lRows, [
		{
			opcode: 'title',
			title: 'My Expenses',
			align: 'center'
			},
		{
			opcode: 'fullsep',
			ch: '-'
			},
		{
			opcode: 'labels',
			lRow: ['Coffee', 'Jan', 'Feb']
			},
		{
			opcode: 'data',
			lRow: ['', '30.00', '40.00']
			},
		{
			opcode: 'data',
			lRow: ['', '130.00', '40.00']
			},
		{
			opcode: 'sep',
			ch: '-'
			},
		{
			opcode: 'subtotals',
			lRow: ['', '160.00', '80.00']
			},
		{
			opcode: 'data',
			lRow: ['', '10.00', '20.00']
			},
		{
			opcode: 'data',
			lRow: ['', '1000.00', '40.00']
			},
		{
			opcode: 'fullsep',
			ch: '='
			},
		{
			opcode: 'totals',
			lRow: ['', '1170.00', '140.00']
			}
		])
	equal(table.getTotalWidth(), 21)
	equal(table.lCols, [
		{align: 'l', format: undef,  width: 6, total: undef, subtotal: undef},
		{align: 'r', format: '%.2f', width: 7, total: 1170, subtotal: 1010},
		{align: 'r', format: '%.2f', width: 6, total: 140, subtotal: 60}
		])
}
	)();

// -------------------------------------------------------------

(() => {
	const table = new TextTable('l r%.2f r%.2f')
	table.title(  'My Expenses')
	table.fullsep('-')
	table.labels( ['', 'Jan', 'Feb'])
	table.sep()
	table.data(   ['coffee', 30, 40])
	table.data(   ['dining', 130, 40])
	table.sep(    '-')
	table.subtotals()
	table.data(   ['one time', 10, 20])
	table.data(   ['other', 1000, 40])
	table.fullsep('=')
	table.totals()
	const str = table.asString()

	equal(str, `      My Expenses
-----------------------
           Jan    Feb
-------- ------- ------
coffee     30.00  40.00
dining    130.00  40.00
-------- ------- ------
          160.00  80.00
one time   10.00  20.00
other    1000.00  40.00
=======================
         1170.00 140.00`)
}
	)();

// -------------------------------------------------------------
// --- Test lHide parameter in toString()

(() => {
	const table = new TextTable('l r%.2f r%.2f')
	table.title(  'My Expenses')
	table.fullsep('-')
	table.labels( ['', 'Jan', 'Feb'])
	table.sep()
	table.data(   ['coffee', 30, 40])
	table.data(   ['dining', 130, 40])
	table.sep(    '-')
	table.subtotals()
	table.data(   ['one time', 10, 20])
	table.data(   ['other', 1000, 40])
	table.fullsep('=')
	table.totals()

	equal(table.asString(o`lHide=1`), `  My Expenses
---------------
          Feb
-------- ------
coffee    40.00
dining    40.00
-------- ------
          80.00
one time  20.00
other     40.00
===============
         140.00`)

	equal(table.asString(o`lHide=Jan`), `  My Expenses
---------------
          Feb
-------- ------
coffee    40.00
dining    40.00
-------- ------
          80.00
one time  20.00
other     40.00
===============
         140.00`)
	equal(table.asString(o`lHide=1,2`), `My Expenses
--------

--------
coffee
dining
--------

one time
other
========
`)

	equal(table.asString(o`lHide=Jan,Feb`), `My Expenses
--------

--------
coffee
dining
--------

one time
other
========
`)
}
	)()

